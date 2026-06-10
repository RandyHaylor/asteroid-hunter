import { Vector3 } from 'three'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'
import type { TractorBeamStats } from '../shipStats'

// R4/R5/D5/D14: the tractor beam reels the ship to the solved cover point and then HOLDS it on a
// spherical shell around the asteroid (shell radius = distance from asteroid center to the cover
// point). The ship can never penetrate the shell — a pull whose straight line passes through the
// asteroid wraps around it instead. Stateless controller — re-targeting mid-pull (tap a different
// asteroid, R5) is just the caller passing a new cover point.

export const COVER_ARRIVAL_DISTANCE_METERS = 2.5
export const COVER_ARRIVAL_SPEED_METERS_PER_SECOND = 4

/** fraction of the beam's peak acceleration budgeted for braking — headroom prevents overshoot */
const BRAKING_ACCELERATION_BUDGET_FRACTION = 0.7
/** within this factor of the shell radius the pull is steered tangentially around the asteroid */
const SHELL_GUIDANCE_RADIUS_FACTOR = 1.02

// scratch objects reused every step to avoid per-frame allocations in the hot simulation path
const scratchToCoverPoint = new Vector3()
const scratchTargetVelocity = new Vector3()
const scratchPullAcceleration = new Vector3()
const scratchRadialDirection = new Vector3()
const scratchTangentEscapeDirection = new Vector3()

const WORLD_UP_AXIS = new Vector3(0, 1, 0)
const WORLD_RIGHT_AXIS = new Vector3(1, 0, 0)

/** D14: the ship may never enter the hold shell — clamp position onto it and kill inward velocity */
function clampShipOntoHoldShell(
  shipState: ShipRigidBodyState,
  asteroidCenterMeters: Vector3,
  holdShellRadiusMeters: number,
): void {
  scratchRadialDirection.copy(shipState.positionMeters).sub(asteroidCenterMeters)
  const distanceFromCenterMeters = scratchRadialDirection.length()
  if (distanceFromCenterMeters >= holdShellRadiusMeters || distanceFromCenterMeters < 1e-6) return

  scratchRadialDirection.divideScalar(distanceFromCenterMeters)
  shipState.positionMeters
    .copy(asteroidCenterMeters)
    .addScaledVector(scratchRadialDirection, holdShellRadiusMeters)

  const inwardRadialSpeed = shipState.velocityMetersPerSecond.dot(scratchRadialDirection)
  if (inwardRadialSpeed < 0) {
    shipState.velocityMetersPerSecond.addScaledVector(scratchRadialDirection, -inwardRadialSpeed)
  }
}

export function stepTractorBeamPull(
  shipState: ShipRigidBodyState,
  coverPointMeters: Vector3,
  asteroidCenterMeters: Vector3,
  tractorBeamStats: TractorBeamStats,
  deltaSeconds: number,
): { hasArrivedAtCover: boolean } {
  const holdShellRadiusMeters = coverPointMeters.distanceTo(asteroidCenterMeters)

  // STEP 1: offset from the ship to the cover point
  scratchToCoverPoint.copy(coverPointMeters).sub(shipState.positionMeters)
  const distanceToCoverMeters = scratchToCoverPoint.length()
  const currentSpeedMetersPerSecond = shipState.velocityMetersPerSecond.length()

  // STEP 2: arrived (R4) — hold position on the shell and gradually bleed off residual velocity
  if (
    distanceToCoverMeters <= COVER_ARRIVAL_DISTANCE_METERS &&
    currentSpeedMetersPerSecond < COVER_ARRIVAL_SPEED_METERS_PER_SECOND
  ) {
    const residualVelocityDecay = Math.exp(-tractorBeamStats.arrivalDampingPerSecond * deltaSeconds)
    shipState.velocityMetersPerSecond.multiplyScalar(residualVelocityDecay)
    shipState.positionMeters.addScaledVector(shipState.velocityMetersPerSecond, deltaSeconds)
    clampShipOntoHoldShell(shipState, asteroidCenterMeters, holdShellRadiusMeters)
    return { hasArrivedAtCover: true }
  }

  // STEP 3 (P term): target approach speed toward the cover point.
  // Far field: braking-limited sqrt profile so the beam can always stop in time.
  // Near field: linear ramp with gain = arrivalDampingPerSecond/4, which makes the velocity-tracking
  // loop below exactly critically damped — no overshoot oscillation.
  const brakingLimitedSpeed = Math.sqrt(
    2 *
      BRAKING_ACCELERATION_BUDGET_FRACTION *
      tractorBeamStats.maxPullAccelerationMetersPerSecondSquared *
      distanceToCoverMeters,
  )
  const arrivalApproachSpeedGainPerSecond = tractorBeamStats.arrivalDampingPerSecond / 4
  const arrivalLimitedSpeed = arrivalApproachSpeedGainPerSecond * distanceToCoverMeters
  const targetApproachSpeed = Math.min(brakingLimitedSpeed, arrivalLimitedSpeed)
  if (distanceToCoverMeters > 1e-6) {
    scratchTargetVelocity.copy(scratchToCoverPoint).multiplyScalar(targetApproachSpeed / distanceToCoverMeters)
  } else {
    scratchTargetVelocity.set(0, 0, 0)
  }

  // STEP 4 (D term): correct toward the target velocity at arrivalDampingPerSecond, clamped to the
  // beam's peak pull acceleration (R17: both knobs are upgradeable stats)
  scratchPullAcceleration
    .copy(scratchTargetVelocity)
    .sub(shipState.velocityMetersPerSecond)
    .multiplyScalar(tractorBeamStats.arrivalDampingPerSecond)
  if (scratchPullAcceleration.length() > tractorBeamStats.maxPullAccelerationMetersPerSecondSquared) {
    scratchPullAcceleration.setLength(tractorBeamStats.maxPullAccelerationMetersPerSecondSquared)
  }

  // STEP 5 (D14 shell guidance): near the hold shell, strip the inward radial component of the pull
  // so the beam slides the ship AROUND the asteroid instead of into it
  scratchRadialDirection.copy(shipState.positionMeters).sub(asteroidCenterMeters)
  const distanceFromCenterMeters = scratchRadialDirection.length()
  if (
    distanceFromCenterMeters > 1e-6 &&
    distanceFromCenterMeters < holdShellRadiusMeters * SHELL_GUIDANCE_RADIUS_FACTOR
  ) {
    scratchRadialDirection.divideScalar(distanceFromCenterMeters)
    const inwardPullComponent = scratchPullAcceleration.dot(scratchRadialDirection)
    if (inwardPullComponent < 0) {
      scratchPullAcceleration.addScaledVector(scratchRadialDirection, -inwardPullComponent)
    }

    // antipodal dead spot: the cover point is straight through the asteroid, so the filtered pull is
    // ~zero — kick tangentially in a deterministic direction until a natural tangent component appears
    const remainingPullMagnitude = scratchPullAcceleration.length()
    if (
      remainingPullMagnitude < tractorBeamStats.maxPullAccelerationMetersPerSecondSquared * 0.05 &&
      distanceToCoverMeters > COVER_ARRIVAL_DISTANCE_METERS * 2
    ) {
      scratchTangentEscapeDirection.crossVectors(scratchRadialDirection, WORLD_UP_AXIS)
      if (scratchTangentEscapeDirection.lengthSq() < 1e-6) {
        scratchTangentEscapeDirection.crossVectors(scratchRadialDirection, WORLD_RIGHT_AXIS)
      }
      scratchTangentEscapeDirection.normalize()
      scratchPullAcceleration.addScaledVector(
        scratchTangentEscapeDirection,
        tractorBeamStats.maxPullAccelerationMetersPerSecondSquared * 0.5,
      )
    }
  }

  // STEP 6: integrate velocity and position, then enforce the shell
  shipState.velocityMetersPerSecond.addScaledVector(scratchPullAcceleration, deltaSeconds)
  shipState.positionMeters.addScaledVector(shipState.velocityMetersPerSecond, deltaSeconds)
  clampShipOntoHoldShell(shipState, asteroidCenterMeters, holdShellRadiusMeters)

  return { hasArrivedAtCover: false }
}
