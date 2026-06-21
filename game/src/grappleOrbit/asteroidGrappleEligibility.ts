import { Vector3 } from 'three'

// D102: which asteroids the ship may grapple, by GEOMETRY (new-changes line 33-34). Picture the ship's
// path of travel as a line with a plane perpendicular to it at the ship. An asteroid IN FRONT of that
// plane cannot be grappled (you'd have to grab something you haven't passed). An asteroid AT or BEHIND
// the plane can be grappled IF the line from the ship to it is within 45° of that plane — i.e. roughly
// "you're passing it / have just passed it", which makes the slingshot believable. Beyond 45° behind
// (nearly straight back) it's already gone. Pure (no allocations beyond a reused scratch); unit-tested.

// grappleable cosine band: dot(travelDirUnit, toAsteroidUnit) in (-cos45°, 0].  0 = exactly at the
// perpendicular plane; -cos45° (≈ -0.7071) = 45° behind the plane. >0 is in front (not grappleable).
const GRAPPLE_BEHIND_PLANE_MAX_COSINE = 0 // at/behind the perpendicular plane
const GRAPPLE_BEHIND_PLANE_MIN_COSINE = -Math.cos((45 * Math.PI) / 180) // within 45° of the plane

const scratchToAsteroid = new Vector3()
const scratchTravelDirection = new Vector3()

export type AsteroidGrappleEligibility = 'grappleable' | 'approachingInFront' | 'passedBehind' | 'noTravel'

/**
 * Classify an asteroid relative to the ship's travel direction:
 *  - 'grappleable'        — at/behind the perpendicular plane AND within 45° of it (may be grappled)
 *  - 'approachingInFront' — still in front of the plane (coming up; not grappleable yet)
 *  - 'passedBehind'       — behind the plane but past the 45° window (already gone; not grappleable)
 *  - 'noTravel'           — speed ≈ 0, so there's no travel plane to judge against
 */
export function classifyAsteroidGrappleEligibility(
  shipPositionMeters: Vector3,
  asteroidPositionMeters: Vector3,
  shipVelocityMetersPerSecond: Vector3,
): AsteroidGrappleEligibility {
  const speedMetersPerSecond = shipVelocityMetersPerSecond.length()
  if (speedMetersPerSecond < 1e-6) return 'noTravel'
  scratchToAsteroid.copy(asteroidPositionMeters).sub(shipPositionMeters)
  if (scratchToAsteroid.lengthSq() < 1e-9) return 'noTravel'
  scratchToAsteroid.normalize()
  scratchTravelDirection.copy(shipVelocityMetersPerSecond).divideScalar(speedMetersPerSecond)
  const travelDotToAsteroid = scratchTravelDirection.dot(scratchToAsteroid)
  if (travelDotToAsteroid > GRAPPLE_BEHIND_PLANE_MAX_COSINE) return 'approachingInFront' // in front of the plane
  if (travelDotToAsteroid < GRAPPLE_BEHIND_PLANE_MIN_COSINE) return 'passedBehind' // behind beyond the 45° window
  return 'grappleable'
}

export function isAsteroidGrappleableByTravelAngle(
  shipPositionMeters: Vector3,
  asteroidPositionMeters: Vector3,
  shipVelocityMetersPerSecond: Vector3,
): boolean {
  return (
    classifyAsteroidGrappleEligibility(shipPositionMeters, asteroidPositionMeters, shipVelocityMetersPerSecond) ===
    'grappleable'
  )
}
