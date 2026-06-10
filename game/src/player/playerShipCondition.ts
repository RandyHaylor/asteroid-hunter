// D7: player damage model — hull HP plus a regenerating shield.
// The shield soaks incoming weapon damage first and regenerates after a quiet period
// (rewards ducking behind tractor cover, R4/R5); hull damage persists for the whole wave,
// and hull reaching zero means death = restart the wave (D2/D7).
// Pure logic: time is injected via nowSeconds parameters so the module is fully unit-testable.

export const PLAYER_MAX_SHIELD_POINTS = 100
export const PLAYER_MAX_HULL_POINTS = 100

/** quiet seconds without taking damage before the shield starts regenerating */
export const SHIELD_REGEN_DELAY_SECONDS = 4
export const SHIELD_REGEN_POINTS_PER_SECOND = 20

export type PlayerShipCondition = {
  applyIncomingWeaponDamage(damageAmount: number, nowSeconds: number): void
  updateShieldRegeneration(deltaSeconds: number, nowSeconds: number): void
  isPlayerDestroyed(): boolean
  restoreForWaveRestart(): void
  getShieldPointsFraction(): number
  getHullPointsFraction(): number
}

export function createPlayerShipCondition(): PlayerShipCondition {
  let shieldPoints = PLAYER_MAX_SHIELD_POINTS
  let hullPoints = PLAYER_MAX_HULL_POINTS
  /** -Infinity = "never damaged", so regeneration is allowed immediately on a fresh ship */
  let lastDamageTimeSeconds = Number.NEGATIVE_INFINITY

  return {
    applyIncomingWeaponDamage(damageAmount: number, nowSeconds: number): void {
      // STEP 1: the shield absorbs as much of the hit as it can (D7)
      const damageAbsorbedByShield = Math.min(shieldPoints, damageAmount)
      shieldPoints -= damageAbsorbedByShield

      // STEP 2: any overflow bleeds through to the hull, which never regenerates (D7)
      const damageOverflowToHull = damageAmount - damageAbsorbedByShield
      hullPoints = Math.max(0, hullPoints - damageOverflowToHull)

      // STEP 3: taking any damage restarts the shield regeneration delay
      lastDamageTimeSeconds = nowSeconds
    },

    updateShieldRegeneration(deltaSeconds: number, nowSeconds: number): void {
      // STEP 1: regeneration only kicks in after a quiet window without damage (rewards taking cover)
      const secondsSinceLastDamage = nowSeconds - lastDamageTimeSeconds
      if (secondsSinceLastDamage < SHIELD_REGEN_DELAY_SECONDS) return

      // STEP 2: regenerate the shield, capped at max; the hull is intentionally never touched (D7)
      shieldPoints = Math.min(
        PLAYER_MAX_SHIELD_POINTS,
        shieldPoints + SHIELD_REGEN_POINTS_PER_SECOND * deltaSeconds,
      )
    },

    isPlayerDestroyed(): boolean {
      return hullPoints <= 0
    },

    restoreForWaveRestart(): void {
      // death = restart wave with a fully restored ship (D2/D7)
      shieldPoints = PLAYER_MAX_SHIELD_POINTS
      hullPoints = PLAYER_MAX_HULL_POINTS
      lastDamageTimeSeconds = Number.NEGATIVE_INFINITY
    },

    getShieldPointsFraction(): number {
      return shieldPoints / PLAYER_MAX_SHIELD_POINTS
    },

    getHullPointsFraction(): number {
      return hullPoints / PLAYER_MAX_HULL_POINTS
    },
  }
}
