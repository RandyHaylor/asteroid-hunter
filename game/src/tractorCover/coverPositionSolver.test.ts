import { describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import { solveCoverPositionBehindAsteroid } from './coverPositionSolver'
import {
  COVER_ARRIVAL_DISTANCE_METERS,
  COVER_ARRIVAL_SPEED_METERS_PER_SECOND,
  stepTractorBeamPull,
} from './tractorBeamPullForce'
import { isLineOfSightBlockedByAsteroids } from '../gameSimulation/lineOfSightProbe'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import { createShipRigidBodyStateAtRest } from '../gameSimulation/newtonianShipPhysics'
import type { TractorBeamStats } from '../shipStats'

const FIXED_TIMESTEP_SECONDS = 1 / 60

let nextTestEntityId = 1

function makeLargeAsteroid(position: Vector3, radiusMeters: number): AsteroidBody {
  return {
    asteroidId: nextTestEntityId++,
    sizeClass: 'large',
    positionMeters: position.clone(),
    velocityMetersPerSecond: new Vector3(),
    currentRadiusMeters: radiusMeters,
    massKg: 1_000_000,
    hitPointsRemaining: 100,
    isDestroyed: false,
    renderObject: new Object3D(),
  }
}

function makeEnemyShipAt(position: Vector3): EnemyShip {
  return {
    enemyShipId: nextTestEntityId++,
    behaviorTier: 'dumbPatrol',
    positionMeters: position.clone(),
    velocityMetersPerSecond: new Vector3(),
    orientation: new Quaternion(),
    shieldPointsRemaining: 40,
    hitPointsRemaining: 10,
    isDestroyed: false,
    renderObject: new Object3D(),
  }
}

describe('solveCoverPositionBehindAsteroid', () => {
  it('(a) single enemy: cover point lands on the opposite side and the asteroid blocks LOS from the enemy', () => {
    const coverAsteroid = makeLargeAsteroid(new Vector3(0, 0, 0), 40)
    const enemy = makeEnemyShipAt(new Vector3(600, 0, 0))
    const playerPosition = new Vector3(-10, 0, 300)
    const playerFacing = new Vector3(0, 0, -1)

    const coverPoint = solveCoverPositionBehindAsteroid(
      coverAsteroid,
      [enemy],
      playerPosition,
      playerFacing,
      new Vector3(),
    )

    // opposite side: direction center→cover opposes direction center→enemy
    const coverDirection = coverPoint.clone().sub(coverAsteroid.positionMeters).normalize()
    expect(coverDirection.dot(new Vector3(1, 0, 0))).toBeLessThan(-0.99)

    // standoff: radius 40 + max(8, 40*0.35)=14 → 54 m from center
    expect(coverPoint.distanceTo(coverAsteroid.positionMeters)).toBeCloseTo(54, 5)

    expect(isLineOfSightBlockedByAsteroids(enemy.positionMeters, coverPoint, [coverAsteroid])).toBe(true)
  })

  it('(b) one close + one far enemy at perpendicular bearings: the CLOSEST enemy is always fully blocked (R7 clamp)', () => {
    const coverAsteroid = makeLargeAsteroid(new Vector3(0, 0, 0), 40)
    // distances chosen so the 1/d² weighted average tilts ~42° toward the far enemy,
    // forcing the clamp to rotate the hide direction back to fully hide from the closest enemy
    const closestEnemy = makeEnemyShipAt(new Vector3(400, 0, 0))
    const farEnemy = makeEnemyShipAt(new Vector3(0, 0, 420))
    const playerPosition = new Vector3(0, 0, -300)
    const playerFacing = new Vector3(0, 0, 1)

    const coverPoint = solveCoverPositionBehindAsteroid(
      coverAsteroid,
      [closestEnemy, farEnemy],
      playerPosition,
      playerFacing,
      new Vector3(),
    )

    // the clamp guarantee: hide direction sits beyond 90° + asteroid angular radius from the closest enemy
    const hideDirection = coverPoint.clone().sub(coverAsteroid.positionMeters).normalize()
    const closestEnemyDirection = closestEnemy.positionMeters
      .clone()
      .sub(coverAsteroid.positionMeters)
      .normalize()
    const asteroidAngularRadius = Math.asin(40 / 54)
    expect(hideDirection.angleTo(closestEnemyDirection)).toBeGreaterThan(Math.PI / 2 + asteroidAngularRadius)

    expect(isLineOfSightBlockedByAsteroids(closestEnemy.positionMeters, coverPoint, [coverAsteroid])).toBe(
      true,
    )
  })

  it('(c) no enemies in range: cover point lies along the player facing direction beyond the asteroid center', () => {
    const coverAsteroid = makeLargeAsteroid(new Vector3(0, 0, 0), 40)
    // an enemy far outside missile threat range must be ignored
    const outOfRangeEnemy = makeEnemyShipAt(new Vector3(2500, 0, 0))
    const playerPosition = new Vector3(0, 0, 300)
    const playerFacing = new Vector3(0, 0, -1)

    const coverPoint = solveCoverPositionBehindAsteroid(
      coverAsteroid,
      [outOfRangeEnemy],
      playerPosition,
      playerFacing,
      new Vector3(),
    )

    const coverDirection = coverPoint.clone().sub(coverAsteroid.positionMeters).normalize()
    expect(coverDirection.dot(playerFacing)).toBeGreaterThan(0.99)
    expect(coverPoint.distanceTo(coverAsteroid.positionMeters)).toBeCloseTo(54, 5)
  })

  it('ignores destroyed enemies when building the threat axis', () => {
    const coverAsteroid = makeLargeAsteroid(new Vector3(0, 0, 0), 40)
    const destroyedEnemy = makeEnemyShipAt(new Vector3(300, 0, 0))
    destroyedEnemy.isDestroyed = true
    const playerFacing = new Vector3(0, 1, 0)

    const coverPoint = solveCoverPositionBehindAsteroid(
      coverAsteroid,
      [destroyedEnemy],
      new Vector3(0, -200, 0),
      playerFacing,
      new Vector3(),
    )

    // falls back to facing-based default cover since no alive threats remain
    const coverDirection = coverPoint.clone().sub(coverAsteroid.positionMeters).normalize()
    expect(coverDirection.dot(playerFacing)).toBeGreaterThan(0.99)
  })
})

describe('stepTractorBeamPull', () => {
  const testTractorBeamStats: TractorBeamStats = {
    maxPullAccelerationMetersPerSecondSquared: 140,
    arrivalDampingPerSecond: 4,
    tractorGrabMaxRangeMeters: 350,
  }

  it('pulls the ship from rest to the cover point without overshoot and settles within arrival tolerance', () => {
    const shipState = createShipRigidBodyStateAtRest()
    shipState.positionMeters.set(300, 200, -100)
    const coverPoint = new Vector3(0, 0, 0)
    // asteroid center sits beyond the cover point along the approach, so the inbound path never clips the shell
    const asteroidCenter = new Vector3(-24, -16, 8)

    let arrivalStepIndex = -1
    let previousDistance = shipState.positionMeters.distanceTo(coverPoint)
    for (let stepIndex = 0; stepIndex < 1800; stepIndex++) {
      const { hasArrivedAtCover } = stepTractorBeamPull(
        shipState,
        coverPoint,
        asteroidCenter,
        testTractorBeamStats,
        FIXED_TIMESTEP_SECONDS,
      )
      const distance = shipState.positionMeters.distanceTo(coverPoint)
      // no overshoot oscillation: distance to cover never increases on the way in
      expect(distance).toBeLessThanOrEqual(previousDistance + 1e-3)
      previousDistance = distance
      if (hasArrivedAtCover) {
        arrivalStepIndex = stepIndex
        break
      }
    }

    expect(arrivalStepIndex).toBeGreaterThan(-1)
    expect(arrivalStepIndex).toBeLessThan(1800)
    expect(shipState.positionMeters.distanceTo(coverPoint)).toBeLessThanOrEqual(COVER_ARRIVAL_DISTANCE_METERS)
    expect(shipState.velocityMetersPerSecond.length()).toBeLessThan(COVER_ARRIVAL_SPEED_METERS_PER_SECOND)
  })

  it('after arrival, residual velocity bleeds off and the ship stays parked at the cover point', () => {
    const shipState = createShipRigidBodyStateAtRest()
    shipState.positionMeters.set(2, 0, 0)
    shipState.velocityMetersPerSecond.set(0, 3, 0)
    const coverPoint = new Vector3(0, 0, 0)
    const asteroidCenter = new Vector3(-30, 0, 0)

    for (let stepIndex = 0; stepIndex < 300; stepIndex++) {
      stepTractorBeamPull(shipState, coverPoint, asteroidCenter, testTractorBeamStats, FIXED_TIMESTEP_SECONDS)
    }

    expect(shipState.positionMeters.distanceTo(coverPoint)).toBeLessThan(COVER_ARRIVAL_DISTANCE_METERS + 1)
    expect(shipState.velocityMetersPerSecond.length()).toBeLessThan(0.1)
  })

  it('caps the pull acceleration at the beam stat (R17 upgrade knob)', () => {
    const shipState = createShipRigidBodyStateAtRest()
    shipState.positionMeters.set(500, 0, 0)
    const coverPoint = new Vector3(0, 0, 0)
    const asteroidCenter = new Vector3(-30, 0, 0)
    const maxVelocityChangePerStep =
      testTractorBeamStats.maxPullAccelerationMetersPerSecondSquared * FIXED_TIMESTEP_SECONDS

    const velocityBeforeStep = new Vector3()
    for (let stepIndex = 0; stepIndex < 120; stepIndex++) {
      velocityBeforeStep.copy(shipState.velocityMetersPerSecond)
      stepTractorBeamPull(shipState, coverPoint, asteroidCenter, testTractorBeamStats, FIXED_TIMESTEP_SECONDS)
      const velocityChange = shipState.velocityMetersPerSecond.distanceTo(velocityBeforeStep)
      expect(velocityChange).toBeLessThanOrEqual(maxVelocityChangePerStep * 1.0001)
    }
  })

  it('D14: never penetrates the hold shell, wraps around the asteroid, and still reaches a far-side cover point', () => {
    const shipState = createShipRigidBodyStateAtRest()
    // antipodal worst case: the straight line to the cover point passes through the asteroid center
    shipState.positionMeters.set(0, 0, -150)
    const asteroidCenter = new Vector3(0, 0, 0)
    const coverPoint = new Vector3(0, 0, 28) // shell radius 28 (asteroid radius 20 + standoff 8)
    const holdShellRadius = coverPoint.distanceTo(asteroidCenter)

    let hasArrived = false
    for (let stepIndex = 0; stepIndex < 3600 && !hasArrived; stepIndex++) {
      hasArrived = stepTractorBeamPull(
        shipState,
        coverPoint,
        asteroidCenter,
        testTractorBeamStats,
        FIXED_TIMESTEP_SECONDS,
      ).hasArrivedAtCover
      expect(shipState.positionMeters.distanceTo(asteroidCenter)).toBeGreaterThanOrEqual(holdShellRadius * 0.99)
    }

    expect(hasArrived).toBe(true)
    expect(shipState.positionMeters.distanceTo(coverPoint)).toBeLessThanOrEqual(COVER_ARRIVAL_DISTANCE_METERS)
  })
})
