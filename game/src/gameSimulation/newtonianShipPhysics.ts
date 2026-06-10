import { Quaternion, Vector3 } from 'three'
import type { ShipFlightStats } from '../shipStats'

// R3: simple but realistic acceleration physics.
// D12: the throttle demands a target speed; the engines apply bounded thrust to reach and hold it,
// so the ship still drifts (velocity lags facing) when turning.

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
  /** 0..1 fraction of max forward speed demanded by the throttle lever */
  throttleFraction: number
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

/** how aggressively thrust corrects toward the throttle target velocity (1/seconds) */
const VELOCITY_CORRECTION_GAIN_PER_SECOND = 1.5

/** D15: how quickly the actual turn rate eases toward the commanded rate (1/seconds, time constant ~0.17 s) */
const TURN_RATE_RESPONSE_PER_SECOND = 6

// scratch objects reused every step to avoid per-frame allocations in the hot simulation path
const scratchPitchRotation = new Quaternion()
const scratchYawRotation = new Quaternion()
const scratchForwardDirection = new Vector3()
const scratchThrottleTargetVelocity = new Vector3()
const scratchThrustAcceleration = new Vector3()

export function getShipForwardDirection(shipState: ShipRigidBodyState, outDirection: Vector3): Vector3 {
  return outDirection.copy(SHIP_LOCAL_FORWARD_AXIS).applyQuaternion(shipState.orientation)
}

export function stepShipFlightSimulation(
  shipState: ShipRigidBodyState,
  controlInput: ShipFlightControlInput,
  flightStats: ShipFlightStats,
  deltaSeconds: number,
): void {
  // STEP 1: joystick pitch/yaw command turn rates around the ship's local axes.
  // D15: the actual rate eases toward the commanded rate so turns ramp in instead of snapping to max.
  const turnRateBlend = 1 - Math.exp(-TURN_RATE_RESPONSE_PER_SECOND * deltaSeconds)
  const commandedPitchRate = controlInput.pitchInput * flightStats.maxTurnRateRadiansPerSecond
  // positive yawInput = nose right = negative rotation around the local up axis
  const commandedYawRate = -controlInput.yawInput * flightStats.maxTurnRateRadiansPerSecond
  shipState.currentPitchRateRadiansPerSecond +=
    (commandedPitchRate - shipState.currentPitchRateRadiansPerSecond) * turnRateBlend
  shipState.currentYawRateRadiansPerSecond +=
    (commandedYawRate - shipState.currentYawRateRadiansPerSecond) * turnRateBlend

  const pitchAngleRadians = shipState.currentPitchRateRadiansPerSecond * deltaSeconds
  const yawAngleRadians = shipState.currentYawRateRadiansPerSecond * deltaSeconds
  scratchPitchRotation.setFromAxisAngle(SHIP_LOCAL_RIGHT_AXIS, pitchAngleRadians)
  scratchYawRotation.setFromAxisAngle(SHIP_LOCAL_UP_AXIS, yawAngleRadians)
  shipState.orientation.multiply(scratchYawRotation).multiply(scratchPitchRotation).normalize()

  // STEP 2: throttle target velocity = forward direction * demanded speed (D12)
  getShipForwardDirection(shipState, scratchForwardDirection)
  const throttleTargetSpeedMetersPerSecond =
    controlInput.throttleFraction * flightStats.maxForwardSpeedMetersPerSecond
  scratchThrottleTargetVelocity.copy(scratchForwardDirection).multiplyScalar(throttleTargetSpeedMetersPerSecond)

  // STEP 3: thrust acceleration corrects toward the target velocity, clamped to what the engines produce
  scratchThrustAcceleration
    .copy(scratchThrottleTargetVelocity)
    .sub(shipState.velocityMetersPerSecond)
    .multiplyScalar(VELOCITY_CORRECTION_GAIN_PER_SECOND)
  const maxEngineAccelerationMetersPerSecondSquared = flightStats.maxThrustNewtons / flightStats.shipMassKg
  if (scratchThrustAcceleration.length() > maxEngineAccelerationMetersPerSecondSquared) {
    scratchThrustAcceleration.setLength(maxEngineAccelerationMetersPerSecondSquared)
  }

  // STEP 4: integrate velocity and position
  shipState.velocityMetersPerSecond.addScaledVector(scratchThrustAcceleration, deltaSeconds)
  shipState.positionMeters.addScaledVector(shipState.velocityMetersPerSecond, deltaSeconds)
}
