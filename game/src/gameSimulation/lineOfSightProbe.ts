import { Vector3 } from 'three'
import type { AsteroidBody } from './gameWorldTypes'

// Shared occlusion test used by cover quality (R8), radar visibility (R14), and enemy AI.
// Asteroids are treated as spheres of currentRadiusMeters — cheap and good enough for the prototype.

const scratchSegmentDirection = new Vector3()
const scratchFromToAsteroidCenter = new Vector3()
const scratchClosestPointOnSegment = new Vector3()

export function isLineOfSightBlockedByAsteroids(
  fromPoint: Vector3,
  toPoint: Vector3,
  asteroids: readonly AsteroidBody[],
): boolean {
  scratchSegmentDirection.copy(toPoint).sub(fromPoint)
  const segmentLengthMeters = scratchSegmentDirection.length()
  if (segmentLengthMeters < 1e-6) return false
  scratchSegmentDirection.divideScalar(segmentLengthMeters)

  for (const asteroid of asteroids) {
    if (asteroid.isDestroyed) continue

    // closest point on the sight segment to the asteroid center
    scratchFromToAsteroidCenter.copy(asteroid.positionMeters).sub(fromPoint)
    const projectedDistanceAlongSegment = scratchFromToAsteroidCenter.dot(scratchSegmentDirection)
    const clampedProjection = Math.max(0, Math.min(segmentLengthMeters, projectedDistanceAlongSegment))
    scratchClosestPointOnSegment.copy(fromPoint).addScaledVector(scratchSegmentDirection, clampedProjection)

    const distanceFromSegmentToCenter = scratchClosestPointOnSegment.distanceTo(asteroid.positionMeters)
    if (distanceFromSegmentToCenter < asteroid.currentRadiusMeters) return true
  }

  return false
}
