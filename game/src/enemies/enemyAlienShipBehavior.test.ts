import { describe, expect, it } from 'vitest'
import { Object3D, Scene, Vector3 } from 'three'
import {
  computeCoverHidePointBehindAsteroid,
  createEnemyFireIntent,
  createEnemyShip,
  updateEnemyShipBehavior,
} from './enemyAlienShipBehavior'
import type { AsteroidBody, AsteroidSizeClass } from '../gameSimulation/gameWorldTypes'
import { isLineOfSightBlockedByAsteroids } from '../gameSimulation/lineOfSightProbe'

const FIXED_TIMESTEP_SECONDS = 1 / 60

let nextTestAsteroidId = 1

function makeTestAsteroid(
  positionMeters: Vector3,
  radiusMeters: number,
  sizeClass: AsteroidSizeClass = 'large',
): AsteroidBody {
  return {
    asteroidId: nextTestAsteroidId++,
    sizeClass,
    positionMeters,
    velocityMetersPerSecond: new Vector3(),
    currentRadiusMeters: radiusMeters,
    massKg: 1_000_000,
    hitPointsRemaining: 100,
    isDestroyed: false,
    renderObject: new Object3D(),
  }
}

describe('dumbPatrol tier', () => {
  it('wanders between steps with speed bounded by the patrol cruise speed', () => {
    const gameScene = new Scene()
    const patrolEnemy = createEnemyShip('dumbPatrol', new Vector3(0, 0, 0), gameScene)
    const farAwayPlayerPosition = new Vector3(5000, 0, 0)
    const fireIntent = createEnemyFireIntent()

    const positionBeforeStep = new Vector3()
    let stepsWherePositionChanged = 0
    for (let stepIndex = 0; stepIndex < 600; stepIndex++) {
      positionBeforeStep.copy(patrolEnemy.positionMeters)
      updateEnemyShipBehavior(patrolEnemy, [], farAwayPlayerPosition, FIXED_TIMESTEP_SECONDS, fireIntent)
      if (patrolEnemy.positionMeters.distanceTo(positionBeforeStep) > 0) stepsWherePositionChanged++
      expect(patrolEnemy.velocityMetersPerSecond.length()).toBeLessThanOrEqual(30 * 1.02)
    }

    // it actually patrols: nearly every step moves the ship (the first step starts from rest)
    expect(stepsWherePositionChanged).toBeGreaterThan(590)
    expect(patrolEnemy.positionMeters.length()).toBeGreaterThan(1)
    // render object tracks the rigid body
    expect(patrolEnemy.renderObject.position.distanceTo(patrolEnemy.positionMeters)).toBe(0)
  })

  it('does not fire lasers when an asteroid blocks line of sight, fires when clear / in range / ahead', () => {
    const gameScene = new Scene()
    const patrolEnemy = createEnemyShip('dumbPatrol', new Vector3(0, 0, 0), gameScene)
    // identity orientation faces -Z; the player sits dead ahead inside laser short range
    const playerPosition = new Vector3(0, 0, -150)
    const blockingAsteroid = makeTestAsteroid(new Vector3(0, 0, -75), 30)
    const fireIntent = createEnemyFireIntent()

    updateEnemyShipBehavior(patrolEnemy, [blockingAsteroid], playerPosition, FIXED_TIMESTEP_SECONDS, fireIntent)
    expect(fireIntent.wantsToFireLaser).toBe(false)
    expect(fireIntent.wantsToFireMissile).toBe(false)

    updateEnemyShipBehavior(patrolEnemy, [], playerPosition, FIXED_TIMESTEP_SECONDS, fireIntent)
    expect(fireIntent.wantsToFireLaser).toBe(true)
    // dumbPatrol never fires missiles (D8)
    expect(fireIntent.wantsToFireMissile).toBe(false)
    // aim points straight at the player
    expect(fireIntent.aimDirectionWorld.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(0.05)
  })

  it('does not fire lasers when the player is in range but well outside the 25° nose cone', () => {
    const gameScene = new Scene()
    const patrolEnemy = createEnemyShip('dumbPatrol', new Vector3(0, 0, 0), gameScene)
    // identity orientation faces -Z; the player sits 90° off the nose at short range
    const playerBesidePosition = new Vector3(150, 0, 0)
    const fireIntent = createEnemyFireIntent()

    updateEnemyShipBehavior(patrolEnemy, [], playerBesidePosition, FIXED_TIMESTEP_SECONDS, fireIntent)
    expect(fireIntent.wantsToFireLaser).toBe(false)
  })
})

describe('orbitStrafe tier', () => {
  it('sets the missile intent only with clear line of sight inside the long-range envelope', () => {
    const gameScene = new Scene()
    const strafeEnemy = createEnemyShip('orbitStrafe', new Vector3(0, 0, 0), gameScene)
    const playerPosition = new Vector3(0, 0, -400)
    const blockingAsteroid = makeTestAsteroid(new Vector3(0, 0, -200), 50)
    const fireIntent = createEnemyFireIntent()

    updateEnemyShipBehavior(strafeEnemy, [blockingAsteroid], playerPosition, FIXED_TIMESTEP_SECONDS, fireIntent)
    expect(fireIntent.wantsToFireMissile).toBe(false)

    updateEnemyShipBehavior(strafeEnemy, [], playerPosition, FIXED_TIMESTEP_SECONDS, fireIntent)
    expect(fireIntent.wantsToFireMissile).toBe(true)
    // 400 m is beyond laser short range
    expect(fireIntent.wantsToFireLaser).toBe(false)
  })
})

describe('coverHunter tier', () => {
  it('computes a hide point with the asteroid between itself and the player', () => {
    const coverAsteroid = makeTestAsteroid(new Vector3(200, 0, 0), 40)
    const playerPosition = new Vector3(0, 0, 0)

    const hidePoint = computeCoverHidePointBehindAsteroid(coverAsteroid, playerPosition, new Vector3())

    // far side of the asteroid, standing 12 m off the surface
    expect(hidePoint.distanceTo(new Vector3(252, 0, 0))).toBeLessThan(1e-6)
    expect(isLineOfSightBlockedByAsteroids(hidePoint, playerPosition, [coverAsteroid])).toBe(true)
  })

  it('flies to its hide point so the chosen asteroid blocks the player line of sight', () => {
    const gameScene = new Scene()
    const hunterEnemy = createEnemyShip('coverHunter', new Vector3(300, 50, 0), gameScene)
    const playerPosition = new Vector3(0, 0, 0)
    const coverAsteroid = makeTestAsteroid(new Vector3(200, 0, 0), 40)
    const asteroids = [coverAsteroid]
    const fireIntent = createEnemyFireIntent()

    // 4 simulated seconds: long enough to settle on the hide point, shorter than the first peek (>=5 s)
    for (let stepIndex = 0; stepIndex < 240; stepIndex++) {
      updateEnemyShipBehavior(hunterEnemy, asteroids, playerPosition, FIXED_TIMESTEP_SECONDS, fireIntent)
    }

    const expectedHidePoint = computeCoverHidePointBehindAsteroid(coverAsteroid, playerPosition, new Vector3())
    expect(hunterEnemy.positionMeters.distanceTo(expectedHidePoint)).toBeLessThan(20)
    expect(isLineOfSightBlockedByAsteroids(hunterEnemy.positionMeters, playerPosition, asteroids)).toBe(true)
  })
})

describe('destroyed enemies', () => {
  it('early-returns without moving or setting fire intent', () => {
    const gameScene = new Scene()
    const destroyedEnemy = createEnemyShip('orbitStrafe', new Vector3(10, 20, 30), gameScene)
    destroyedEnemy.isDestroyed = true
    const fireIntent = createEnemyFireIntent()
    fireIntent.wantsToFireLaser = true
    fireIntent.wantsToFireMissile = true

    updateEnemyShipBehavior(destroyedEnemy, [], new Vector3(0, 0, -100), FIXED_TIMESTEP_SECONDS, fireIntent)

    expect(destroyedEnemy.positionMeters.distanceTo(new Vector3(10, 20, 30))).toBe(0)
    expect(fireIntent.wantsToFireLaser).toBe(false)
    expect(fireIntent.wantsToFireMissile).toBe(false)
  })
})

describe('createEnemyShip', () => {
  it('assigns unique ids, 60 hit points, and adds the mesh to the scene at the spawn position', () => {
    const gameScene = new Scene()
    const firstEnemy = createEnemyShip('dumbPatrol', new Vector3(1, 2, 3), gameScene)
    const secondEnemy = createEnemyShip('coverHunter', new Vector3(4, 5, 6), gameScene)

    expect(firstEnemy.enemyShipId).not.toBe(secondEnemy.enemyShipId)
    expect(firstEnemy.hitPointsRemaining).toBe(60)
    expect(firstEnemy.isDestroyed).toBe(false)
    expect(firstEnemy.behaviorTier).toBe('dumbPatrol')
    expect(gameScene.children).toContain(firstEnemy.renderObject)
    expect(firstEnemy.renderObject.position.distanceTo(new Vector3(1, 2, 3))).toBe(0)
    // spawn vector is copied, not aliased
    expect(firstEnemy.positionMeters).not.toBe(firstEnemy.renderObject.position)
  })
})
