import { describe, expect, it } from 'vitest'
import { Object3D, Scene, Vector3 } from 'three'
import {
  grappleStrengthForArchetype,
  createEnemyFireIntent,
  createEnemyShip,
  updateEnemyShipBehavior,
} from './enemyAlienShipBehavior'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'

// D68: enemy grapple is an ADDITIVE ability — escalates by wave, and when present makes the enemy arc
// (fixed-radius slingshot) around a nearby large asteroid woven into its normal behavior.

function makeLargeAsteroid(positionMeters: Vector3, radiusMeters: number): AsteroidBody {
  return {
    asteroidId: 1,
    sizeClass: 'large',
    positionMeters: positionMeters.clone(),
    velocityMetersPerSecond: new Vector3(),
    currentRadiusMeters: radiusMeters,
    massKg: 1_000_000,
    hitPointsRemaining: 100,
    isDestroyed: false,
    renderObject: new Object3D(),
  }
}

describe('grappleStrengthForArchetype', () => {
  it('bundles grapple into the archetype: Drone none, Raider weak, Stalker strong', () => {
    expect(grappleStrengthForArchetype('dumbPatrol')).toBe(0)
    expect(grappleStrengthForArchetype('orbitStrafe')).toBe(0.5)
    expect(grappleStrengthForArchetype('coverHunter')).toBe(1)
  })
})

describe('additive enemy grapple weave', () => {
  it('a grapple-capable enemy near a large asteroid arcs at a ~fixed radius (slingshot)', () => {
    const gameScene = new Scene()
    const enemy = createEnemyShip('coverHunter', new Vector3(120, 0, 0), gameScene) // Stalker = strong grapple
    const asteroid = makeLargeAsteroid(new Vector3(0, 0, 0), 40) // within latch range (120 m < 240 m)
    const playerPosition = new Vector3(0, 0, 2000) // far away — doesn't interfere
    const fireIntent = createEnemyFireIntent()
    const dt = 1 / 60

    // step a few seconds; once latched the distance to the asteroid should hold ~constant (a circle)
    const distancesWhileArcing: number[] = []
    for (let step = 0; step < 120; step++) {
      updateEnemyShipBehavior(enemy, [asteroid], playerPosition, dt, fireIntent, null)
      distancesWhileArcing.push(enemy.positionMeters.distanceTo(asteroid.positionMeters))
    }
    // after the first latch frame the radius is fixed; sample the latter portion and check low variance
    const sample = distancesWhileArcing.slice(10, 90)
    const minDistance = Math.min(...sample)
    const maxDistance = Math.max(...sample)
    expect(maxDistance - minDistance).toBeLessThan(5) // holds a near-constant orbit radius (arcing)
    expect(minDistance).toBeGreaterThan(30) // never tighter than the min orbit radius
  })

  it('an enemy with zero grapple strength never locks to a fixed radius (no arc)', () => {
    const gameScene = new Scene()
    const enemy = createEnemyShip('dumbPatrol', new Vector3(120, 0, 0), gameScene) // Drone = no grapple
    const asteroid = makeLargeAsteroid(new Vector3(0, 0, 0), 40)
    const playerPosition = new Vector3(0, 0, 2000)
    const fireIntent = createEnemyFireIntent()
    const dt = 1 / 60

    // without grapple it NEVER latches an asteroid (grappledAsteroid stays null every frame).
    // (Checking the latch flag directly is deterministic — the old distance-variance check was flaky
    // because dumbPatrol's wander is Math.random-driven and can stay coincidentally equidistant.)
    let everGrappled = false
    for (let step = 0; step < 120; step++) {
      updateEnemyShipBehavior(enemy, [asteroid], playerPosition, dt, fireIntent, null)
      if (enemy.grappledAsteroid !== null) everGrappled = true
    }
    expect(everGrappled).toBe(false)
  })
})
