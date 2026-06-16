import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import { autoAimConfig, selectAutoAimTargetInNoseCone } from './noseConeAutoAim'

// D6: the auto-aim cone selects the closest live enemy within coneHalfAngleRadians of the nose.
// D51: it also requires a clear line of sight — occluded enemies are never locked onto.

let nextTestEnemyShipId = 1

function makeTestEnemyShipAt(positionMeters: THREE.Vector3, isDestroyed = false): EnemyShip {
  return {
    enemyShipId: nextTestEnemyShipId++,
    behaviorTier: 'dumbPatrol',
    positionMeters,
    velocityMetersPerSecond: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
    shieldPointsRemaining: isDestroyed ? 0 : 40,
    hitPointsRemaining: isDestroyed ? 0 : 30,
    isDestroyed,
    renderObject: new THREE.Object3D(),
  }
}

// the LOS probe only reads positionMeters / currentRadiusMeters / isDestroyed
function makeTestAsteroidAt(positionMeters: THREE.Vector3, radiusMeters: number): AsteroidBody {
  return { positionMeters, currentRadiusMeters: radiusMeters, isDestroyed: false } as unknown as AsteroidBody
}

const playerAtOrigin = new THREE.Vector3(0, 0, 0)
const playerFacingNegativeZ = new THREE.Vector3(0, 0, -1)
const noAsteroids: readonly AsteroidBody[] = []

function selectTarget(
  enemyShips: EnemyShip[],
  asteroids: readonly AsteroidBody[] = noAsteroids,
  maxLockDistanceMeters = 1e9,
): EnemyShip | null {
  return selectAutoAimTargetInNoseCone(
    playerAtOrigin,
    playerFacingNegativeZ,
    enemyShips,
    asteroids,
    maxLockDistanceMeters,
  )
}

describe('selectAutoAimTargetInNoseCone (D6)', () => {
  it('D56: does NOT lock an in-cone enemy beyond the max lock distance', () => {
    const enemyDeadAheadFar = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -1500))
    expect(selectTarget([enemyDeadAheadFar], noAsteroids, 1200)).toBeNull()
    // the same enemy within range locks normally
    const enemyDeadAheadNear = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -800))
    expect(selectTarget([enemyDeadAheadNear], noAsteroids, 1200)).toBe(enemyDeadAheadNear)
  })

  it('selects an enemy inside the nose cone', () => {
    const enemyOffsetMeters = 100 * Math.tan(THREE.MathUtils.degToRad(5))
    const enemyInsideCone = makeTestEnemyShipAt(new THREE.Vector3(enemyOffsetMeters, 0, -100))
    expect(selectTarget([enemyInsideCone])).toBe(enemyInsideCone)
  })

  it('does not select an enemy outside the cone', () => {
    const enemyOffsetMeters = 100 * Math.tan(THREE.MathUtils.degToRad(25))
    const enemyOutsideCone = makeTestEnemyShipAt(new THREE.Vector3(enemyOffsetMeters, 0, -100))
    expect(selectTarget([enemyOutsideCone])).toBeNull()
  })

  it('respects the configurable cone half angle boundary', () => {
    const justInsideConeRadians = autoAimConfig.coneHalfAngleRadians * 0.99
    const enemyJustInsideCone = makeTestEnemyShipAt(new THREE.Vector3(100 * Math.tan(justInsideConeRadians), 0, -100))
    const justOutsideConeRadians = autoAimConfig.coneHalfAngleRadians * 1.01
    const enemyJustOutsideCone = makeTestEnemyShipAt(new THREE.Vector3(100 * Math.tan(justOutsideConeRadians), 0, -100))
    expect(selectTarget([enemyJustInsideCone])).toBe(enemyJustInsideCone)
    expect(selectTarget([enemyJustOutsideCone])).toBeNull()
  })

  it('selects the nearest of two enemies inside the cone', () => {
    const farEnemyInCone = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -200))
    const nearEnemyInCone = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -80))
    expect(selectTarget([farEnemyInCone, nearEnemyInCone])).toBe(nearEnemyInCone)
  })

  it('ignores dead enemies even when they are closest and in the cone', () => {
    const deadNearEnemy = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -50), true)
    const liveFarEnemy = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -150))
    expect(selectTarget([deadNearEnemy, liveFarEnemy])).toBe(liveFarEnemy)
  })

  it('returns null when there are no enemies at all', () => {
    expect(selectTarget([])).toBeNull()
  })

  // D51: occlusion
  it('does not lock onto an enemy occluded by an asteroid', () => {
    const enemyInCone = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -100))
    const blockingAsteroid = makeTestAsteroidAt(new THREE.Vector3(0, 0, -50), 20)
    expect(selectTarget([enemyInCone], [blockingAsteroid])).toBeNull()
  })

  it('still locks when an asteroid is off the line of sight', () => {
    const enemyInCone = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -100))
    const offToSideAsteroid = makeTestAsteroidAt(new THREE.Vector3(80, 0, -50), 20)
    expect(selectTarget([enemyInCone], [offToSideAsteroid])).toBe(enemyInCone)
  })
})
