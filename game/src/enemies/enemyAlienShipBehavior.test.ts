import { describe, expect, it } from 'vitest'
import { Object3D, Scene, Vector3 } from 'three'
import {
  computeCoverHidePointBehindAsteroid,
  createEnemyFireIntent,
  createEnemyShip,
  isAsteroidGrappledByAnotherEnemy,
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
      expect(patrolEnemy.velocityMetersPerSecond.length()).toBeLessThanOrEqual(105 * 1.02) // D116: patrol speed +30 → 105
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
  })

  // D119: the laser range (456 m) now exceeds the orbitStrafe standoff (380 m), so a strafer holding at
  // its standoff is INSIDE laser range and actually fires its laser — it no longer just lobs missiles.
  it('fires its laser at its standoff distance (laser range now exceeds the 380 m standoff)', () => {
    const gameScene = new Scene()
    const strafeEnemy = createEnemyShip('orbitStrafe', new Vector3(0, 0, 0), gameScene)
    const playerAtStandoffPosition = new Vector3(0, 0, -400) // ~ the orbitStrafe hold distance, within 456 m
    const fireIntent = createEnemyFireIntent()

    updateEnemyShipBehavior(strafeEnemy, [], playerAtStandoffPosition, FIXED_TIMESTEP_SECONDS, fireIntent)
    expect(fireIntent.wantsToFireLaser).toBe(true)
    expect(fireIntent.wantsToFireMissile).toBe(true) // 400 m also sits in the 250–900 m missile envelope
  })

  it('does not fire its laser beyond laser range (still missiles in the long envelope)', () => {
    const gameScene = new Scene()
    const strafeEnemy = createEnemyShip('orbitStrafe', new Vector3(0, 0, 0), gameScene)
    const playerBeyondLaserPosition = new Vector3(0, 0, -500) // past the 456 m laser range, inside missile envelope
    const fireIntent = createEnemyFireIntent()

    updateEnemyShipBehavior(strafeEnemy, [], playerBeyondLaserPosition, FIXED_TIMESTEP_SECONDS, fireIntent)
    expect(fireIntent.wantsToFireLaser).toBe(false)
    expect(fireIntent.wantsToFireMissile).toBe(true)
  })
})

describe('D120: lead-aim with capped tracking rate', () => {
  it('leads a crossing player — aims AHEAD of the player position, not straight at it', () => {
    const gameScene = new Scene()
    const enemy = createEnemyShip('dumbPatrol', new Vector3(0, 0, 0), gameScene)
    // player dead ahead (−Z) but crossing fast in +X: the intercept point is ahead in +X
    const playerPosition = new Vector3(0, 0, -400)
    const playerVelocity = new Vector3(120, 0, 0)
    const fireIntent = createEnemyFireIntent()

    // first update initializes the tracked aim straight to the lead solution (no startup slew)
    updateEnemyShipBehavior(enemy, [], playerPosition, FIXED_TIMESTEP_SECONDS, fireIntent, null, [], playerVelocity)

    // straight-at-player aim would have x ≈ 0; a led aim points toward where the player is heading (+X)
    expect(fireIntent.aimDirectionWorld.x).toBeGreaterThan(0.1)
  })

  it('caps how fast the aim can swing — a sudden 90° target jump moves the aim only by the rate cap', () => {
    const gameScene = new Scene()
    const enemy = createEnemyShip('dumbPatrol', new Vector3(0, 0, 0), gameScene)
    const fireIntent = createEnemyFireIntent()
    const stationary = new Vector3(0, 0, 0)

    // frame 1: player straight ahead (−Z), stationary → tracked aim initializes to (0,0,−1)
    updateEnemyShipBehavior(enemy, [], new Vector3(0, 0, -400), FIXED_TIMESTEP_SECONDS, fireIntent, null, [], stationary)
    const aimAfterInit = fireIntent.aimDirectionWorld.clone()
    expect(aimAfterInit.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6)

    // frame 2: player jumps 90° to the side (+X) → desired aim is (1,0,0), a 90° swing away
    updateEnemyShipBehavior(enemy, [], new Vector3(400, 0, 0), FIXED_TIMESTEP_SECONDS, fireIntent, null, [], stationary)

    const aimAngleMovedRadians = fireIntent.aimDirectionWorld.angleTo(aimAfterInit)
    const expectedCapPerFrameRadians = 0.7 * FIXED_TIMESTEP_SECONDS // ENEMY_AIM_TRACKING_MAX_RATE × dt
    // moved by exactly the per-frame cap — nowhere near the 90° (≈1.57 rad) the target demanded
    expect(aimAngleMovedRadians).toBeCloseTo(expectedCapPerFrameRadians, 3)
    expect(aimAngleMovedRadians).toBeLessThan(0.02)
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
    // start near the hide point so it settles within the window below (D67 lowered the first-peek
    // interval to >=2.5 s, so the settle window must stay under that or a peek pulls it off-point)
    const hunterEnemy = createEnemyShip('coverHunter', new Vector3(275, 25, 0), gameScene)
    // D70: isolate the cover-MOVEMENT logic — disable this enemy's (Stalker) grapple, which would
    // otherwise latch the cover asteroid and arc instead of settling at the hide point. Grapple itself
    // is covered separately in enemyGrapple.test.ts.
    hunterEnemy.grappleStrength = 0
    const playerPosition = new Vector3(0, 0, 0)
    const coverAsteroid = makeTestAsteroid(new Vector3(200, 0, 0), 40)
    const asteroids = [coverAsteroid]
    const fireIntent = createEnemyFireIntent()

    // 2 simulated seconds: long enough to settle on the hide point, shorter than the first peek (>=2.5 s)
    for (let stepIndex = 0; stepIndex < 120; stepIndex++) {
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

describe('isAsteroidGrappledByAnotherEnemy (D115 anti-cluster)', () => {
  it('is true for an asteroid a DIFFERENT enemy is grappling, false for self / unclaimed', () => {
    const gameScene = new Scene()
    const enemyA = createEnemyShip('coverHunter', new Vector3(0, 0, 0), gameScene)
    const enemyB = createEnemyShip('coverHunter', new Vector3(100, 0, 0), gameScene)
    const claimedAsteroid = makeTestAsteroid(new Vector3(50, 0, 0), 40)
    const freeAsteroid = makeTestAsteroid(new Vector3(-50, 0, 0), 40)
    enemyA.grappledAsteroid = claimedAsteroid
    const allEnemies = [enemyA, enemyB]
    // enemyB sees the claimed asteroid as taken by another enemy...
    expect(isAsteroidGrappledByAnotherEnemy(claimedAsteroid, enemyB, allEnemies)).toBe(true)
    // ...but enemyA (the one grappling it) does NOT count itself, and a free rock is open to anyone
    expect(isAsteroidGrappledByAnotherEnemy(claimedAsteroid, enemyA, allEnemies)).toBe(false)
    expect(isAsteroidGrappledByAnotherEnemy(freeAsteroid, enemyB, allEnemies)).toBe(false)
  })
})
