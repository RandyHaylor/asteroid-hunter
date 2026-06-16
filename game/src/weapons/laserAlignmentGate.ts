import { Vector3 } from 'three'

// D52: lasers travel straight out of the ship's nose, so they may only fire once the hull has
// actually rotated close enough to the firing solution. Missiles bypass this gate — they home.
export const LASER_FIRING_ALIGNMENT_MAX_DEGREES = 5

/**
 * True when the ship's forward direction is within maxAlignmentDegrees of the desired aim
 * direction — i.e., the hull has rotated close enough to the firing solution to let lasers fire.
 * Both directions are treated as directions (need not be normalized; we normalize internally).
 */
export function isShipAlignedForLaserFire(
  shipForwardDirection: Vector3,
  desiredAimDirection: Vector3,
  maxAlignmentDegrees: number = LASER_FIRING_ALIGNMENT_MAX_DEGREES,
): boolean {
  // Guard zero-length inputs — there is no meaningful angle to compare.
  if (shipForwardDirection.lengthSq() <= 1e-12 || desiredAimDirection.lengthSq() <= 1e-12) {
    return false
  }

  // Clone before normalizing so we never mutate the caller's vectors.
  const normalizedForward = shipForwardDirection.clone().normalize()
  const normalizedAim = desiredAimDirection.clone().normalize()

  const angleDegrees = (normalizedForward.angleTo(normalizedAim) * 180) / Math.PI
  return angleDegrees <= maxAlignmentDegrees
}
