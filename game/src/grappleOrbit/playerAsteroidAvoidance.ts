import { Vector3 } from 'three'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'

// D71: grapple-based collision AVOIDANCE for the player — a smooth, distance-based pushback that
// strengthens the closer the ship gets to an asteroid's surface. Constant-momentum-friendly: it bends
// the velocity DIRECTION outward (away from the asteroid) without changing speed (mirrors the D62 edge
// far-orbit steer). Triggers only when fairly close, and ramps in via a smoothstep so it eases on/off.
// Pure helpers (no scene state) so they're unit-testable; rendering + state live in main.ts.

// only engage when the ship is within this SURFACE distance of an asteroid ("fairly close")
export const AVOIDANCE_TRIGGER_SURFACE_DISTANCE_METERS = 80
// outward repulsion speed at FULL proximity (m/s, dt-scaled). A positional pushback — robust for any
// approach angle incl. head-on (a velocity-only deflection can't turn a perfectly head-on heading).
export const AVOIDANCE_MAX_PUSHBACK_SPEED_METERS_PER_SECOND = 70

const scratchOutwardDirection = new Vector3()
const scratchTravelDirectionUnit = new Vector3()

export type NearestAvoidanceAsteroid = {
  asteroid: AsteroidBody
  surfaceDistanceMeters: number
}

/**
 * Nearest asteroid by SURFACE distance (centre distance − radius), excluding the one the player is
 * intentionally orbiting. Returns null if none are within the trigger distance.
 */
export function findNearestAvoidanceAsteroid(
  playerPositionMeters: Vector3,
  asteroids: readonly AsteroidBody[],
  excludedOrbitedAsteroid: AsteroidBody | null,
): NearestAvoidanceAsteroid | null {
  let nearest: NearestAvoidanceAsteroid | null = null
  for (const asteroid of asteroids) {
    if (asteroid.isDestroyed || asteroid === excludedOrbitedAsteroid) continue
    const surfaceDistanceMeters =
      playerPositionMeters.distanceTo(asteroid.positionMeters) - asteroid.currentRadiusMeters
    if (surfaceDistanceMeters > AVOIDANCE_TRIGGER_SURFACE_DISTANCE_METERS) continue
    if (nearest === null || surfaceDistanceMeters < nearest.surfaceDistanceMeters) {
      nearest = { asteroid, surfaceDistanceMeters }
    }
  }
  return nearest
}

/**
 * Proximity ramp 0..1: 0 at/beyond the trigger distance, smoothly rising to 1 at the surface (and
 * staying 1 if the ship is inside the surface distance). Smoothstep so the push + ring fade ease on/off.
 */
export function computeAvoidanceProximityFraction(surfaceDistanceMeters: number): number {
  const linear = 1 - surfaceDistanceMeters / AVOIDANCE_TRIGGER_SURFACE_DISTANCE_METERS
  const clamped = Math.max(0, Math.min(1, linear))
  return clamped * clamped * (3 - 2 * clamped) // smoothstep
}

/**
 * D93: STRAFE the ship sideways past the asteroid, scaled by proximity. The push is the outward
 * (away-from-asteroid) direction with its ALONG-TRAVEL component removed — i.e. perpendicular to the
 * velocity — so the ship slides sideways off the collision course WITHOUT changing its heading (a
 * "strafing" correction, per design). For a purely head-on/fore-aft approach (no perpendicular
 * component) it falls back to plain outward push so a dead-on heading still deflects. Velocity
 * magnitude/heading is untouched; only position is nudged. Mutates playerPositionMeters in place.
 */
export function applyAvoidancePushback(
  playerPositionMeters: Vector3,
  asteroidPositionMeters: Vector3,
  playerVelocityMetersPerSecond: Vector3,
  proximityFraction: number,
  deltaSeconds: number,
): void {
  if (proximityFraction <= 0) return
  scratchOutwardDirection.copy(playerPositionMeters).sub(asteroidPositionMeters)
  if (scratchOutwardDirection.lengthSq() < 1e-9) return
  // strafe: drop the component along the travel direction so the push is a sideways slide
  const speedMetersPerSecond = playerVelocityMetersPerSecond.length()
  if (speedMetersPerSecond > 1e-6) {
    scratchTravelDirectionUnit.copy(playerVelocityMetersPerSecond).divideScalar(speedMetersPerSecond)
    scratchOutwardDirection.addScaledVector(scratchTravelDirectionUnit, -scratchOutwardDirection.dot(scratchTravelDirectionUnit))
  }
  if (scratchOutwardDirection.lengthSq() < 1e-9) {
    // head-on (outward was purely along travel) — fall back to plain outward so we still deflect
    scratchOutwardDirection.copy(playerPositionMeters).sub(asteroidPositionMeters)
  }
  scratchOutwardDirection.normalize()
  playerPositionMeters.addScaledVector(
    scratchOutwardDirection,
    proximityFraction * AVOIDANCE_MAX_PUSHBACK_SPEED_METERS_PER_SECOND * deltaSeconds,
  )
}

/**
 * D93: true once the asteroid is BEHIND the plane perpendicular to the ship's travel (the ship has
 * passed it) — avoidance should stop then. With (near-)zero speed there's no travel plane, so returns
 * false (keep avoiding). "Cleared" = the asteroid is no longer ahead of the ship's motion.
 */
export function isAsteroidClearedBehindTravelPlane(
  playerPositionMeters: Vector3,
  asteroidPositionMeters: Vector3,
  playerVelocityMetersPerSecond: Vector3,
): boolean {
  const speedMetersPerSecond = playerVelocityMetersPerSecond.length()
  if (speedMetersPerSecond < 1e-6) return false
  scratchOutwardDirection.copy(asteroidPositionMeters).sub(playerPositionMeters) // ship → asteroid
  return scratchOutwardDirection.dot(playerVelocityMetersPerSecond) <= 0 // asteroid behind the travel plane
}
