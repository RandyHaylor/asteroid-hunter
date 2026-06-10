import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'
import { autoAimConfig, selectAutoAimTargetInNoseCone } from './noseConeAutoAim'

// D6: the auto-aim cone selects the closest live enemy within coneHalfAngleRadians of the nose.

let nextTestEnemyShipId = 1

function makeTestEnemyShipAt(positionMeters: THREE.Vector3, isDestroyed = false): EnemyShip {
  return {
    enemyShipId: nextTestEnemyShipId++,
    behaviorTier: 'dumbPatrol',
    positionMeters,
    velocityMetersPerSecond: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
    hitPointsRemaining: isDestroyed ? 0 : 30,
    isDestroyed,
    renderObject: new THREE.Object3D(),
  }
}

const playerAtOrigin = new THREE.Vector3(0, 0, 0)
const playerFacingNegativeZ = new THREE.Vector3(0, 0, -1)

describe('selectAutoAimTargetInNoseCone (D6)', () => {
  it('selects an enemy inside the nose cone', () => {
    // 5° off the nose — well inside the 10° half-angle cone
    const enemyOffsetMeters = 100 * Math.tan(THREE.MathUtils.degToRad(5))
    const enemyInsideCone = makeTestEnemyShipAt(new THREE.Vector3(enemyOffsetMeters, 0, -100))

    const selectedTarget = selectAutoAimTargetInNoseCone(playerAtOrigin, playerFacingNegativeZ, [enemyInsideCone])

    expect(selectedTarget).toBe(enemyInsideCone)
  })

  it('does not select an enemy outside the cone', () => {
    // 25° off the nose — clearly outside the cone
    const enemyOffsetMeters = 100 * Math.tan(THREE.MathUtils.degToRad(25))
    const enemyOutsideCone = makeTestEnemyShipAt(new THREE.Vector3(enemyOffsetMeters, 0, -100))

    const selectedTarget = selectAutoAimTargetInNoseCone(playerAtOrigin, playerFacingNegativeZ, [enemyOutsideCone])

    expect(selectedTarget).toBeNull()
  })

  it('respects the configurable cone half angle boundary', () => {
    const justInsideConeRadians = autoAimConfig.coneHalfAngleRadians * 0.99
    const enemyJustInsideCone = makeTestEnemyShipAt(
      new THREE.Vector3(100 * Math.tan(justInsideConeRadians), 0, -100),
    )
    const justOutsideConeRadians = autoAimConfig.coneHalfAngleRadians * 1.01
    const enemyJustOutsideCone = makeTestEnemyShipAt(
      new THREE.Vector3(100 * Math.tan(justOutsideConeRadians), 0, -100),
    )

    expect(
      selectAutoAimTargetInNoseCone(playerAtOrigin, playerFacingNegativeZ, [enemyJustInsideCone]),
    ).toBe(enemyJustInsideCone)
    expect(
      selectAutoAimTargetInNoseCone(playerAtOrigin, playerFacingNegativeZ, [enemyJustOutsideCone]),
    ).toBeNull()
  })

  it('selects the nearest of two enemies inside the cone', () => {
    const farEnemyInCone = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -200))
    const nearEnemyInCone = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -80))

    const selectedTarget = selectAutoAimTargetInNoseCone(playerAtOrigin, playerFacingNegativeZ, [
      farEnemyInCone,
      nearEnemyInCone,
    ])

    expect(selectedTarget).toBe(nearEnemyInCone)
  })

  it('ignores dead enemies even when they are closest and in the cone', () => {
    const deadNearEnemy = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -50), true)
    const liveFarEnemy = makeTestEnemyShipAt(new THREE.Vector3(0, 0, -150))

    const selectedTarget = selectAutoAimTargetInNoseCone(playerAtOrigin, playerFacingNegativeZ, [
      deadNearEnemy,
      liveFarEnemy,
    ])

    expect(selectedTarget).toBe(liveFarEnemy)
  })

  it('returns null when there are no enemies at all', () => {
    expect(selectAutoAimTargetInNoseCone(playerAtOrigin, playerFacingNegativeZ, [])).toBeNull()
  })
})
