import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import {
  AVOIDANCE_TRIGGER_SURFACE_DISTANCE_METERS,
  applyAvoidancePushback,
  computeAvoidanceProximityFraction,
  findNearestAvoidanceAsteroid,
  isAsteroidClearedBehindTravelPlane,
} from './playerAsteroidAvoidance'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'

function makeAsteroid(positionMeters: Vector3, radiusMeters: number): AsteroidBody {
  return {
    asteroidId: 1,
    sizeClass: 'large',
    positionMeters,
    velocityMetersPerSecond: new Vector3(),
    currentRadiusMeters: radiusMeters,
    massKg: 1_000_000,
    hitPointsRemaining: 100,
    isDestroyed: false,
    renderObject: new Object3D(),
  }
}

describe('computeAvoidanceProximityFraction', () => {
  it('is 0 at/beyond the trigger distance and 1 at the surface', () => {
    expect(computeAvoidanceProximityFraction(AVOIDANCE_TRIGGER_SURFACE_DISTANCE_METERS)).toBe(0)
    expect(computeAvoidanceProximityFraction(AVOIDANCE_TRIGGER_SURFACE_DISTANCE_METERS + 50)).toBe(0)
    expect(computeAvoidanceProximityFraction(0)).toBe(1)
    const mid = computeAvoidanceProximityFraction(AVOIDANCE_TRIGGER_SURFACE_DISTANCE_METERS / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })
})

describe('findNearestAvoidanceAsteroid', () => {
  it('returns the closest by surface distance, ignoring the orbited one and far ones', () => {
    const player = new Vector3(0, 0, 0)
    const close = makeAsteroid(new Vector3(90, 0, 0), 40) // surface 50 — in range
    const farther = makeAsteroid(new Vector3(0, 200, 0), 40) // surface 160 — out of range
    const orbited = makeAsteroid(new Vector3(60, 0, 0), 40) // surface 20 but excluded
    const result = findNearestAvoidanceAsteroid(player, [farther, orbited, close], orbited)
    expect(result?.asteroid).toBe(close)
  })

  it('returns null when nothing is within trigger range', () => {
    const player = new Vector3(0, 0, 0)
    const farther = makeAsteroid(new Vector3(0, 500, 0), 40)
    expect(findNearestAvoidanceAsteroid(player, [farther], null)).toBeNull()
  })
})

describe('applyAvoidancePushback (D93 strafe)', () => {
  it('strafes sideways (perpendicular to travel) when outward is perpendicular to the velocity', () => {
    const asteroidPosition = new Vector3(0, 0, 0)
    const player = new Vector3(60, 0, 0) // outward is +X
    const travelVelocity = new Vector3(0, 0, -80) // travelling -Z (outward +X is perpendicular)
    const distanceBefore = player.distanceTo(asteroidPosition)
    for (let step = 0; step < 10; step++) {
      applyAvoidancePushback(player, asteroidPosition, travelVelocity, 1, 1 / 60)
    }
    expect(player.x).toBeGreaterThan(60) // slid sideways (+X) away from the rock
    expect(player.distanceTo(asteroidPosition)).toBeGreaterThan(distanceBefore)
  })

  it('falls back to plain outward push for a head-on approach (outward parallel to travel)', () => {
    const asteroidPosition = new Vector3(0, 0, 0)
    const player = new Vector3(60, 0, 0) // outward +X
    const travelVelocity = new Vector3(-80, 0, 0) // heading straight at the rock (along -X); outward is +X
    applyAvoidancePushback(player, asteroidPosition, travelVelocity, 1, 1 / 60)
    expect(player.x).toBeGreaterThan(60) // still deflected outward despite a dead-on heading
  })

  it('does nothing at zero proximity', () => {
    const player = new Vector3(60, 0, 0)
    applyAvoidancePushback(player, new Vector3(0, 0, 0), new Vector3(0, 0, -80), 0, 1 / 60)
    expect(player.x).toBe(60)
  })
})

describe('isAsteroidClearedBehindTravelPlane (D93)', () => {
  it('is false while the asteroid is still ahead of the travel plane', () => {
    const player = new Vector3(0, 0, 0)
    const asteroidAhead = new Vector3(0, 0, -50) // ahead of -Z travel
    expect(isAsteroidClearedBehindTravelPlane(player, asteroidAhead, new Vector3(0, 0, -80))).toBe(false)
  })

  it('is true once the asteroid is behind the travel plane (ship has passed it)', () => {
    const player = new Vector3(0, 0, 0)
    const asteroidBehind = new Vector3(0, 0, 50) // behind the -Z travel
    expect(isAsteroidClearedBehindTravelPlane(player, asteroidBehind, new Vector3(0, 0, -80))).toBe(true)
  })
})
