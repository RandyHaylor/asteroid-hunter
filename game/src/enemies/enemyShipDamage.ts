import type { EnemyShip } from '../gameSimulation/gameWorldTypes'

// D21: enemies carry a small shield over their hull, mirroring the player's shield-first model (D7).

export const ENEMY_SHIP_MAX_SHIELD_POINTS = 40
export const ENEMY_SHIP_MAX_HULL_POINTS = 60

export function applyWeaponDamageToEnemyShip(enemyShip: EnemyShip, damageAmount: number): void {
  if (enemyShip.isDestroyed) return

  const shieldAbsorbedAmount = Math.min(enemyShip.shieldPointsRemaining, damageAmount)
  enemyShip.shieldPointsRemaining -= shieldAbsorbedAmount

  const hullDamageAmount = damageAmount - shieldAbsorbedAmount
  enemyShip.hitPointsRemaining = Math.max(0, enemyShip.hitPointsRemaining - hullDamageAmount)

  if (enemyShip.hitPointsRemaining <= 0) enemyShip.isDestroyed = true
}

/** D21: damage bars only appear once the enemy has actually been hit */
export function enemyShipHasTakenAnyDamage(enemyShip: EnemyShip): boolean {
  return (
    enemyShip.shieldPointsRemaining < ENEMY_SHIP_MAX_SHIELD_POINTS ||
    enemyShip.hitPointsRemaining < ENEMY_SHIP_MAX_HULL_POINTS
  )
}
