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
 * Push the ship's POSITION outward (away from the asteroid centre), scaled by proximity — a smooth
 * distance-based repulsion that strengthens the closer it gets. Mutates playerPositionMeters in place.
 * Works for any approach angle (incl. head-on). The constant cruise momentum is untouched, so the ship
 * keeps its heading but gets shoved off the collision course — the field curves the path around.
 */
export function applyAvoidancePushback(
  playerPositionMeters: Vector3,
  asteroidPositionMeters: Vector3,
  proximityFraction: number,
  deltaSeconds: number,
): void {
  if (proximityFraction <= 0) return
  scratchOutwardDirection.copy(playerPositionMeters).sub(asteroidPositionMeters)
  if (scratchOutwardDirection.lengthSq() < 1e-9) return
  scratchOutwardDirection.normalize()
  playerPositionMeters.addScaledVector(
    scratchOutwardDirection,
    proximityFraction * AVOIDANCE_MAX_PUSHBACK_SPEED_METERS_PER_SECOND * deltaSeconds,
  )
}
