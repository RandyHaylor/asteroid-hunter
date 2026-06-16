import { Quaternion, Vector3 } from 'three'
import type { ShipFlightStats } from '../shipStats'

// R3 + D54: momentum-based flight. Ships ALWAYS move at a constant cruise speed (turning is
// "expensive" — there is no air to push against). Velocity magnitude never changes; holding thrust
// slowly rotates the velocity VECTOR toward the ship's facing. Facing itself is independent (set by
// the radar drag-steer / rotation path). Not thrusting → the ship coasts in a straight line.

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
  /** D54: while true, thrust rotates the velocity vector toward the ship's facing (does NOT change speed) */
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

/** below this speed the velocity direction is undefined, so we (re)seed it along the ship facing */
const MINIMUM_DEFINED_SPEED_METERS_PER_SECOND = 1e-4

// scratch objects reused every step to avoid per-frame allocations in the hot simulation path
const scratchPitchRotation = new Quaternion()
const scratchYawRotation = new Quaternion()
const scratchForwardDirection = new Vector3()
const scratchVelocityDirection = new Vector3()
const scratchVelocitySteerAxis = new Vector3()
const scratchVelocitySteerRotation = new Quaternion()

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

  // STEP 2: D54 — constant speed; thrust slowly rotates the velocity VECTOR toward the facing.
  getShipForwardDirection(shipState, scratchForwardDirection)
  const cruiseSpeedMetersPerSecond = flightStats.cruiseSpeedMetersPerSecond
  const currentSpeedMetersPerSecond = shipState.velocityMetersPerSecond.length()
  if (currentSpeedMetersPerSecond < MINIMUM_DEFINED_SPEED_METERS_PER_SECOND) {
    // velocity direction undefined (e.g. just spawned) — seed it along the facing
    scratchVelocityDirection.copy(scratchForwardDirection)
  } else {
    scratchVelocityDirection.copy(shipState.velocityMetersPerSecond).divideScalar(currentSpeedMetersPerSecond)
    if (controlInput.thrustActive) {
      // rotate the velocity direction toward the facing by at most thrustTurnRate * dt this frame
      const angleToFacingRadians = scratchVelocityDirection.angleTo(scratchForwardDirection)
      if (angleToFacingRadians > 1e-5) {
        const maxSteerStepRadians = flightStats.thrustTurnRateRadiansPerSecond * deltaSeconds
        const steerStepRadians = Math.min(angleToFacingRadians, maxSteerStepRadians)
        scratchVelocitySteerAxis.crossVectors(scratchVelocityDirection, scratchForwardDirection)
        if (scratchVelocitySteerAxis.lengthSq() > 1e-12) {
          scratchVelocitySteerAxis.normalize()
          scratchVelocitySteerRotation.setFromAxisAngle(scratchVelocitySteerAxis, steerStepRadians)
          scratchVelocityDirection.applyQuaternion(scratchVelocitySteerRotation)
        }
      }
    }
  }

  // STEP 3: re-impose the constant cruise speed and integrate position
  shipState.velocityMetersPerSecond.copy(scratchVelocityDirection).multiplyScalar(cruiseSpeedMetersPerSecond)
  shipState.positionMeters.addScaledVector(shipState.velocityMetersPerSecond, deltaSeconds)
}
