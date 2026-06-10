import { Vector3 } from 'three'
import { PLAY_AREA_RADIUS_METERS } from '../asteroids/asteroidFieldSpawner'

// D10: bounded sphere play area with a soft edge — no wall, just a gentle inward push
// that ramps up past the boundary and turns ships back toward the field.

/** no boundary force inside this fraction of the play radius */
const SOFT_EDGE_ONSET_RADIUS_FRACTION = 0.9
/** the pushback reaches full strength at this fraction of the play radius */
const SOFT_EDGE_FULL_STRENGTH_RADIUS_FRACTION = 1.1
/** inward acceleration at full strength — strong enough to turn any ship around */
const SOFT_EDGE_MAX_INWARD_ACCELERATION_METERS_PER_SECOND_SQUARED = 80

// scratch vector reused every step to avoid per-frame allocations in the hot simulation path
const scratchInwardDirection = new Vector3()

export function applySoftBoundaryPushback(
  positionMeters: Vector3,
  velocityMetersPerSecond: Vector3,
  deltaSeconds: number,
): void {
  // STEP 1: no force while comfortably inside the play area (D10)
  const distanceFromCenterMeters = positionMeters.length()
  const onsetRadiusMeters = PLAY_AREA_RADIUS_METERS * SOFT_EDGE_ONSET_RADIUS_FRACTION
  if (distanceFromCenterMeters <= onsetRadiusMeters) return

  // STEP 2: ramp the inward acceleration quadratically from 0 at the onset radius
  // to full strength at 110% of the play radius (and hold full strength beyond)
  const fullStrengthRadiusMeters = PLAY_AREA_RADIUS_METERS * SOFT_EDGE_FULL_STRENGTH_RADIUS_FRACTION
  const overshootFraction = Math.min(
    1,
    (distanceFromCenterMeters - onsetRadiusMeters) / (fullStrengthRadiusMeters - onsetRadiusMeters),
  )
  const inwardAccelerationMagnitude =
    SOFT_EDGE_MAX_INWARD_ACCELERATION_METERS_PER_SECOND_SQUARED * overshootFraction * overshootFraction

  // STEP 3: accelerate back toward the field center
  scratchInwardDirection.copy(positionMeters).multiplyScalar(-1 / distanceFromCenterMeters)
  velocityMetersPerSecond.addScaledVector(scratchInwardDirection, inwardAccelerationMagnitude * deltaSeconds)
}
