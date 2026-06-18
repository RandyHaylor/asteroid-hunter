import { describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import { createEnemyFireIntent, updateEnemyShipBehavior } from './enemyAlienShipBehavior'
import { ENEMY_SHIP_MAX_HULL_POINTS, ENEMY_SHIP_MAX_SHIELD_POINTS } from './enemyShipDamage'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'

// D67: an enemy that keeps shooting at the player while the player orbits an asteroid eventually
// switches to destroying that asteroid, and keeps at it for a few seconds after the player leaves.

function makeEnemyShip(positionMeters: Vector3): EnemyShip {
  return {
    enemyShipId: 1,
    behaviorTier: 'orbitStrafe', // fires whenever the player is in clear range
    positionMeters: positionMeters.clone(),
    velocityMetersPerSecond: new Vector3(),
    orientation: new Quaternion(),
    shieldPointsRemaining: ENEMY_SHIP_MAX_SHIELD_POINTS,
    hitPointsRemaining: ENEMY_SHIP_MAX_HULL_POINTS,
    isDestroyed: false,
    renderObject: new Object3D(),
    grappleStrength: 0,
  }
}

function makeAsteroid(positionMeters: Vector3): AsteroidBody {
  return {
    asteroidId: 1,
    sizeClass: 'large',
    positionMeters: positionMeters.clone(),
    velocityMetersPerSecond: new Vector3(),
    currentRadiusMeters: 30,
    massKg: 1000,
    hitPointsRemaining: 100,
    isDestroyed: false,
    renderObject: new Object3D(),
  }
}

// the enemy moves while strafing, so judge intent by which target the aim actually points at NOW
function aimAlignmentTo(enemy: EnemyShip, targetPositionMeters: Vector3, aimDirectionWorld: Vector3): number {
  const directionToTarget = targetPositionMeters.clone().sub(enemy.positionMeters).normalize()
  return aimDirectionWorld.dot(directionToTarget)
}

describe('D67 enemy attacks the orbited asteroid', () => {
  it('switches aim from the player to the orbited asteroid after ~3s of shooting', () => {
    const enemy = makeEnemyShip(new Vector3(200, 0, 0))
    const playerPosition = new Vector3(0, 0, 0)
    const orbitedAsteroid = makeAsteroid(new Vector3(0, 0, 50))
    const fireIntent = createEnemyFireIntent()
    const dt = 0.1

    // before the threshold the aim points at the PLAYER, not the asteroid
    updateEnemyShipBehavior(enemy, [], playerPosition, dt, fireIntent, orbitedAsteroid)
    expect(fireIntent.wantsToFireLaser || fireIntent.wantsToFireMissile).toBe(true)
    expect(aimAlignmentTo(enemy, playerPosition, fireIntent.aimDirectionWorld)).toBeGreaterThan(0.99)

    // accumulate >3s of continuous shooting while the player orbits
    for (let step = 0; step < 35; step++) {
      updateEnemyShipBehavior(enemy, [], playerPosition, dt, fireIntent, orbitedAsteroid)
    }
    // now the aim points at the ASTEROID (override)
    expect(aimAlignmentTo(enemy, orbitedAsteroid.positionMeters, fireIntent.aimDirectionWorld)).toBeGreaterThan(0.99)
  })

  it('keeps attacking the asteroid for a few seconds after the player stops orbiting, then stops', () => {
    const enemy = makeEnemyShip(new Vector3(200, 0, 0))
    const playerPosition = new Vector3(0, 0, 0)
    const orbitedAsteroid = makeAsteroid(new Vector3(0, 0, 50))
    const fireIntent = createEnemyFireIntent()
    const dt = 0.1

    for (let step = 0; step < 35; step++) {
      updateEnemyShipBehavior(enemy, [], playerPosition, dt, fireIntent, orbitedAsteroid)
    }
    expect(aimAlignmentTo(enemy, orbitedAsteroid.positionMeters, fireIntent.aimDirectionWorld)).toBeGreaterThan(0.99)

    // player stops orbiting; within the persist window it still attacks the rock
    for (let step = 0; step < 20; step++) {
      updateEnemyShipBehavior(enemy, [], playerPosition, dt, fireIntent, null)
    }
    expect(aimAlignmentTo(enemy, orbitedAsteroid.positionMeters, fireIntent.aimDirectionWorld)).toBeGreaterThan(0.99)

    // past the 3s persist window it gives up and re-targets the player
    for (let step = 0; step < 20; step++) {
      updateEnemyShipBehavior(enemy, [], playerPosition, dt, fireIntent, null)
    }
    expect(aimAlignmentTo(enemy, playerPosition, fireIntent.aimDirectionWorld)).toBeGreaterThan(0.99)
  })
})
