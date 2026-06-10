import * as THREE from 'three'
import type { ShipFlightStats } from '../shipStats'

// D22: weak idle aim-assist. While the player is NOT actively steering, the ship gently turns
// toward the currently locked target. This produces the same -1..1 pitch/yaw inputs the joystick
// would, so it flows through the existing eased rotation step (stepShipRotationFromJoystick) and
// stays bounded by the data-driven aimAssistMaxTurnRateRadiansPerSecond stat (upgradeable, R17).
//
// The locked target only exists when it is already inside the 10° nose cone (noseConeAutoAim), so
// the assist only ever fine-tunes a near-aligned shot — it never swings the ship across the sky.

export type AimAssistRotationInput = {
  /** -1..1, positive pitches the nose up (matches ShipFlightControlInput.pitchInput) */
  pitchInput: number
  /** -1..1, positive yaws the nose right (matches ShipFlightControlInput.yawInput) */
  yawInput: number
}

/**
 * Proportional gain (per radian of bearing error) converting the off-nose angle into a turn-input
 * fraction. Tuned so the assist saturates a few degrees off-nose and eases smoothly to zero as the
 * nose lines up, so it settles instead of oscillating.
 */
const AIM_ASSIST_PROPORTIONAL_GAIN_PER_RADIAN = 4

const NO_ASSIST: AimAssistRotationInput = { pitchInput: 0, yawInput: 0 }

// scratch reused every frame to avoid per-frame allocations in the hot aim path
const scratchInverseOrientation = new THREE.Quaternion()
const scratchTargetDirectionShipLocal = new THREE.Vector3()

function clampToMagnitude(value: number, maxMagnitude: number): number {
  return Math.max(-maxMagnitude, Math.min(maxMagnitude, value))
}

/**
 * Pitch/yaw inputs (-1..1) that steer the ship toward the target, clamped so the resulting turn
 * rate never exceeds aimAssistMaxTurnRateRadiansPerSecond. Returns zero inputs when the assist stat
 * is non-positive (disabled) or the target is degenerate (at the ship's own position).
 */
export function computeIdleAimAssistRotationInput(
  playerOrientation: THREE.Quaternion,
  playerPositionMeters: THREE.Vector3,
  targetPositionMeters: THREE.Vector3,
  flightStats: ShipFlightStats,
): AimAssistRotationInput {
  if (
    flightStats.aimAssistMaxTurnRateRadiansPerSecond <= 0 ||
    flightStats.maxTurnRateRadiansPerSecond <= 0
  ) {
    return NO_ASSIST
  }

  // bearing to the target expressed in the ship's local frame (forward is -z, right is +x, up is +y)
  scratchTargetDirectionShipLocal.copy(targetPositionMeters).sub(playerPositionMeters)
  if (scratchTargetDirectionShipLocal.lengthSq() === 0) return NO_ASSIST
  scratchInverseOrientation.copy(playerOrientation).invert()
  scratchTargetDirectionShipLocal.applyQuaternion(scratchInverseOrientation)

  const forwardComponent = -scratchTargetDirectionShipLocal.z
  const yawErrorRadians = Math.atan2(scratchTargetDirectionShipLocal.x, forwardComponent)
  const pitchErrorRadians = Math.atan2(scratchTargetDirectionShipLocal.y, forwardComponent)

  // the assist may command at most (assistRate / maxTurnRate) of a full-deflection joystick input,
  // because stepShipRotationFromJoystick scales the input by maxTurnRateRadiansPerSecond
  const maxAssistInputFraction = Math.min(
    1,
    flightStats.aimAssistMaxTurnRateRadiansPerSecond / flightStats.maxTurnRateRadiansPerSecond,
  )

  return {
    pitchInput: clampToMagnitude(
      pitchErrorRadians * AIM_ASSIST_PROPORTIONAL_GAIN_PER_RADIAN,
      maxAssistInputFraction,
    ),
    yawInput: clampToMagnitude(
      yawErrorRadians * AIM_ASSIST_PROPORTIONAL_GAIN_PER_RADIAN,
      maxAssistInputFraction,
    ),
  }
}
