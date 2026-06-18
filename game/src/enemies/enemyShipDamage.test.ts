import { describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'
import {
  ENEMY_SHIP_MAX_HULL_POINTS,
  ENEMY_SHIP_MAX_SHIELD_POINTS,
  applyWeaponDamageToEnemyShip,
  enemyShipHasTakenAnyDamage,
} from './enemyShipDamage'

function makeFreshEnemyShip(): EnemyShip {
  return {
    enemyShipId: 1,
    behaviorTier: 'dumbPatrol',
    positionMeters: new Vector3(),
    velocityMetersPerSecond: new Vector3(),
    orientation: new Quaternion(),
    shieldPointsRemaining: ENEMY_SHIP_MAX_SHIELD_POINTS,
    hitPointsRemaining: ENEMY_SHIP_MAX_HULL_POINTS,
    isDestroyed: false,
    renderObject: new Object3D(),
    grappleStrength: 0,
  }
}

describe('applyWeaponDamageToEnemyShip (D21)', () => {
  it('shield absorbs damage before the hull', () => {
    const enemyShip = makeFreshEnemyShip()
    applyWeaponDamageToEnemyShip(enemyShip, 25)
    expect(enemyShip.shieldPointsRemaining).toBe(ENEMY_SHIP_MAX_SHIELD_POINTS - 25)
    expect(enemyShip.hitPointsRemaining).toBe(ENEMY_SHIP_MAX_HULL_POINTS)
  })

  it('overflow past the shield damages the hull', () => {
    const enemyShip = makeFreshEnemyShip()
    applyWeaponDamageToEnemyShip(enemyShip, ENEMY_SHIP_MAX_SHIELD_POINTS + 10)
    expect(enemyShip.shieldPointsRemaining).toBe(0)
    expect(enemyShip.hitPointsRemaining).toBe(ENEMY_SHIP_MAX_HULL_POINTS - 10)
  })

  it('destroys the enemy exactly when the hull reaches zero, never negative', () => {
    const enemyShip = makeFreshEnemyShip()
    applyWeaponDamageToEnemyShip(enemyShip, ENEMY_SHIP_MAX_SHIELD_POINTS + ENEMY_SHIP_MAX_HULL_POINTS + 500)
    expect(enemyShip.hitPointsRemaining).toBe(0)
    expect(enemyShip.isDestroyed).toBe(true)
  })

  it('ignores further damage once destroyed', () => {
    const enemyShip = makeFreshEnemyShip()
    enemyShip.isDestroyed = true
    enemyShip.hitPointsRemaining = 0
    enemyShip.shieldPointsRemaining = 0
    applyWeaponDamageToEnemyShip(enemyShip, 50)
    expect(enemyShip.hitPointsRemaining).toBe(0)
  })

  it('enemyShipHasTakenAnyDamage flips on the first hit (drives bar visibility)', () => {
    const enemyShip = makeFreshEnemyShip()
    expect(enemyShipHasTakenAnyDamage(enemyShip)).toBe(false)
    applyWeaponDamageToEnemyShip(enemyShip, 1)
    expect(enemyShipHasTakenAnyDamage(enemyShip)).toBe(true)
  })
})
