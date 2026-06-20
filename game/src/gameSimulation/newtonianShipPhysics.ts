import { Quaternion, Vector3 } from 'three'
import type { ShipFlightStats } from '../shipStats'

// R3 + D54 + D88: momentum-based flight. Turning is "expensive" — there is no air to push against.
// D88 makes speed VARIABLE (was constant in D54): holding thrust applies a weak linear acceleration
// along the ship's facing, so velocity magnitude grows when the nose aligns with travel and shrinks
// when it opposes travel — capped at the max (cruise) speed. Releasing thrust → the ship COASTS,
// preserving its velocity exactly (no drag). Facing is independent (radar drag-steer / rotation path).
// Because thrust is weak, momentum is expensive to rebuild — grapple-slingshots are the fast redirect.

export type ShipRigidBodyState = {
  positionMeters: Vector3
  velocityMetersPerSecond: Vector3
  orientation: Quaternion
  /** smoothed turn rates (D15): joystick commands ease in instead of snapping to max rate */
  currentPitchRateRadiansPerSecond: number
  currentYawRateRadiansPerSecond: number
}

export type ShipFlightControlInput = {
  /** -1..1, positive pitches the nose up */
  pitchInput: number
  /** -1..1, positive yaws the nose right */
  yawInput: number
  /** D88: while true, thrust accelerates the ship along its facing (gains speed if aligned with travel,
   *  loses speed if opposed), capped at max speed. Released → coast (velocity preserved). */
  thrustActive: boolean
}

export function createShipRigidBodyStateAtRest(): ShipRigidBodyState {
  return {
    positionMeters: new Vector3(),
    velocityMetersPerSecond: new Vector3(),
    orientation: new Quaternion(),
    currentPitchRateRadiansPerSecond: 0,
    currentYawRateRadiansPerSecond: 0,
  }
}

const SHIP_LOCAL_RIGHT_AXIS = new Vector3(1, 0, 0)
const SHIP_LOCAL_UP_AXIS = new Vector3(0, 1, 0)
const SHIP_LOCAL_FORWARD_AXIS = new Vector3(0, 0, -1)

/** D15: how quickly the actual turn rate eases toward the commanded rate (1/seconds, time constant ~0.17 s) */
const TURN_RATE_RESPONSE_PER_SECOND = 6

// scratch objects reused every step to avoid per-frame allocations in the hot simulation path
const scratchPitchRotation = new Quaternion()
const scratchYawRotation = new Quaternion()
const scratchForwardDirection = new Vector3()

export function getShipForwardDirection(shipState: ShipRigidBodyState, outDirection: Vector3): Vector3 {
  return outDirection.copy(SHIP_LOCAL_FORWARD_AXIS).applyQuaternion(shipState.orientation)
}

/** D15/D18: joystick pitch/yaw rotate the ship — its own step so cover mode can rotate without thrust */
export function stepShipRotationFromJoystick(
  shipState: ShipRigidBodyState,
  pitchInput: number,
  yawInput: number,
  flightStats: ShipFlightStats,
  deltaSeconds: number,
): void {
  // D15: the actual rate eases toward the commanded rate so turns ramp in instead of snapping to max
  const turnRateBlend = 1 - Math.exp(-TURN_RATE_RESPONSE_PER_SECOND * deltaSeconds)
  const commandedPitchRate = pitchInput * flightStats.maxTurnRateRadiansPerSecond
  // positive yawInput = nose right = negative rotation around the local up axis
  const commandedYawRate = -yawInput * flightStats.maxTurnRateRadiansPerSecond
  shipState.currentPitchRateRadiansPerSecond +=
    (commandedPitchRate - shipState.currentPitchRateRadiansPerSecond) * turnRateBlend
  shipState.currentYawRateRadiansPerSecond +=
    (commandedYawRate - shipState.currentYawRateRadiansPerSecond) * turnRateBlend

  const pitchAngleRadians = shipState.currentPitchRateRadiansPerSecond * deltaSeconds
  const yawAngleRadians = shipState.currentYawRateRadiansPerSecond * deltaSeconds
  scratchPitchRotation.setFromAxisAngle(SHIP_LOCAL_RIGHT_AXIS, pitchAngleRadians)
  scratchYawRotation.setFromAxisAngle(SHIP_LOCAL_UP_AXIS, yawAngleRadians)
  shipState.orientation.multiply(scratchYawRotation).multiply(scratchPitchRotation).normalize()
}

export function stepShipFlightSimulation(
  shipState: ShipRigidBodyState,
  controlInput: ShipFlightControlInput,
  flightStats: ShipFlightStats,
  deltaSeconds: number,
): void {
  // STEP 1: rotation from the joystick (facing is independent of trajectory)
  stepShipRotationFromJoystick(
    shipState,
    controlInput.pitchInput,
    controlInput.yawInput,
    flightStats,
    deltaSeconds,
  )

  // STEP 2: D88 — Newtonian thrust. Holding thrust adds a weak acceleration along the facing, so the
  // velocity magnitude grows/shrinks depending on whether the nose aligns with or opposes travel.
  // Speed is capped at the max (cruise) speed. No thrust → coast (velocity unchanged this step).
  if (controlInput.thrustActive) {
    getShipForwardDirection(shipState, scratchForwardDirection)
    shipState.velocityMetersPerSecond.addScaledVector(
      scratchForwardDirection,
      flightStats.thrustAccelerationMetersPerSecondSquared * deltaSeconds,
    )
    const maxSpeedMetersPerSecond = flightStats.cruiseSpeedMetersPerSecond
    const newSpeedMetersPerSecond = shipState.velocityMetersPerSecond.length()
    if (newSpeedMetersPerSecond > maxSpeedMetersPerSecond) {
      shipState.velocityMetersPerSecond.multiplyScalar(maxSpeedMetersPerSecond / newSpeedMetersPerSecond)
    }
  }

  // STEP 3: integrate position from the (possibly updated) velocity
  shipState.positionMeters.addScaledVector(shipState.velocityMetersPerSecond, deltaSeconds)
}
