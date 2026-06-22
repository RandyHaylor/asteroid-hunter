import { describe, expect, it } from 'vitest'
import {
  enemyMissileHomingTurnRateForArchetype,
  playerBaseMissileStats,
} from './weaponStats'

// D121: enemy missiles home weakly, and weaker for lower tiers, so the player can shake them.
describe('enemyMissileHomingTurnRateForArchetype', () => {
  it('keeps every enemy tier well below the player base homing rate', () => {
    const playerHoming = playerBaseMissileStats.homingTurnRateRadiansPerSecond
    expect(enemyMissileHomingTurnRateForArchetype('orbitStrafe')).toBeLessThan(playerHoming)
    expect(enemyMissileHomingTurnRateForArchetype('coverHunter')).toBeLessThan(playerHoming)
  })

  it('homes weaker for the lower-tier missile user (Raider orbitStrafe) than the higher (Stalker coverHunter)', () => {
    expect(enemyMissileHomingTurnRateForArchetype('orbitStrafe')).toBeLessThan(
      enemyMissileHomingTurnRateForArchetype('coverHunter'),
    )
  })

  it('returns a non-negative rate for the non-missile patrol drone (lasers only)', () => {
    // dumbPatrol never fires missiles; its value is unused but must be a safe, weakest default
    expect(enemyMissileHomingTurnRateForArchetype('dumbPatrol')).toBeGreaterThanOrEqual(0)
    expect(enemyMissileHomingTurnRateForArchetype('dumbPatrol')).toBeLessThanOrEqual(
      enemyMissileHomingTurnRateForArchetype('orbitStrafe'),
    )
  })
})
