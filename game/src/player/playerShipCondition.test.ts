import { describe, expect, it } from 'vitest'
import {
  createPlayerShipCondition,
  PLAYER_MAX_HULL_POINTS,
  PLAYER_MAX_SHIELD_POINTS,
  SHIELD_REGEN_DELAY_SECONDS,
  SHIELD_REGEN_POINTS_PER_SECOND,
} from './playerShipCondition'

describe('createPlayerShipCondition (D7: hull HP + regenerating shield)', () => {
  it('starts with full shield and full hull and the player alive', () => {
    const playerCondition = createPlayerShipCondition()

    expect(playerCondition.getShieldPointsFraction()).toBe(1)
    expect(playerCondition.getHullPointsFraction()).toBe(1)
    expect(playerCondition.isPlayerDestroyed()).toBe(false)
  })

  it('shield absorbs incoming weapon damage before the hull is touched', () => {
    const playerCondition = createPlayerShipCondition()

    playerCondition.applyIncomingWeaponDamage(30, 10)

    expect(playerCondition.getShieldPointsFraction()).toBeCloseTo(
      (PLAYER_MAX_SHIELD_POINTS - 30) / PLAYER_MAX_SHIELD_POINTS,
    )
    expect(playerCondition.getHullPointsFraction()).toBe(1)
  })

  it('damage overflow beyond the remaining shield bleeds through to the hull', () => {
    const playerCondition = createPlayerShipCondition()

    // 100 shield + 40 overflow into the hull
    playerCondition.applyIncomingWeaponDamage(PLAYER_MAX_SHIELD_POINTS + 40, 10)

    expect(playerCondition.getShieldPointsFraction()).toBe(0)
    expect(playerCondition.getHullPointsFraction()).toBeCloseTo(
      (PLAYER_MAX_HULL_POINTS - 40) / PLAYER_MAX_HULL_POINTS,
    )
  })

  it('shield does not regenerate inside the post-damage delay window', () => {
    const playerCondition = createPlayerShipCondition()
    playerCondition.applyIncomingWeaponDamage(50, 10)

    // tick right up to (but not past) the end of the delay window
    playerCondition.updateShieldRegeneration(1, 11)
    playerCondition.updateShieldRegeneration(1, 10 + SHIELD_REGEN_DELAY_SECONDS - 0.001)

    expect(playerCondition.getShieldPointsFraction()).toBeCloseTo(50 / PLAYER_MAX_SHIELD_POINTS)
  })

  it('shield regenerates at the configured rate once the delay has elapsed, capped at max', () => {
    const playerCondition = createPlayerShipCondition()
    playerCondition.applyIncomingWeaponDamage(50, 10)
    const regenStartSeconds = 10 + SHIELD_REGEN_DELAY_SECONDS

    playerCondition.updateShieldRegeneration(1, regenStartSeconds + 1)
    expect(playerCondition.getShieldPointsFraction()).toBeCloseTo(
      (50 + SHIELD_REGEN_POINTS_PER_SECOND) / PLAYER_MAX_SHIELD_POINTS,
    )

    // a huge quiet stretch fully refills the shield but never overshoots the max
    playerCondition.updateShieldRegeneration(60, regenStartSeconds + 61)
    expect(playerCondition.getShieldPointsFraction()).toBe(1)
  })

  it('another hit mid-regeneration restarts the delay window', () => {
    const playerCondition = createPlayerShipCondition()
    playerCondition.applyIncomingWeaponDamage(60, 10)

    // delay elapses and one second of regeneration lands: 40 + 20 = 60 shield
    const firstRegenTickSeconds = 10 + SHIELD_REGEN_DELAY_SECONDS + 1
    playerCondition.updateShieldRegeneration(1, firstRegenTickSeconds)
    expect(playerCondition.getShieldPointsFraction()).toBeCloseTo(60 / PLAYER_MAX_SHIELD_POINTS)

    // a fresh hit mid-regeneration restarts the delay: no regeneration until it elapses again
    playerCondition.applyIncomingWeaponDamage(10, firstRegenTickSeconds)
    playerCondition.updateShieldRegeneration(
      1,
      firstRegenTickSeconds + SHIELD_REGEN_DELAY_SECONDS - 0.001,
    )
    expect(playerCondition.getShieldPointsFraction()).toBeCloseTo(50 / PLAYER_MAX_SHIELD_POINTS)

    // and it resumes once the restarted delay has fully elapsed
    playerCondition.updateShieldRegeneration(1, firstRegenTickSeconds + SHIELD_REGEN_DELAY_SECONDS + 1)
    expect(playerCondition.getShieldPointsFraction()).toBeCloseTo(70 / PLAYER_MAX_SHIELD_POINTS)
  })

  it('hull never regenerates, even across long quiet stretches (D7: hull damage persists for the wave)', () => {
    const playerCondition = createPlayerShipCondition()
    playerCondition.applyIncomingWeaponDamage(PLAYER_MAX_SHIELD_POINTS + 30, 10)
    const damagedHullFraction = playerCondition.getHullPointsFraction()

    playerCondition.updateShieldRegeneration(1000, 10 + SHIELD_REGEN_DELAY_SECONDS + 1000)

    expect(playerCondition.getShieldPointsFraction()).toBe(1)
    expect(playerCondition.getHullPointsFraction()).toBe(damagedHullFraction)
  })

  it('player is destroyed exactly when the hull reaches zero, and hull never goes negative', () => {
    const playerCondition = createPlayerShipCondition()

    playerCondition.applyIncomingWeaponDamage(PLAYER_MAX_SHIELD_POINTS + PLAYER_MAX_HULL_POINTS - 1, 10)
    expect(playerCondition.isPlayerDestroyed()).toBe(false)

    playerCondition.applyIncomingWeaponDamage(500, 11)
    expect(playerCondition.isPlayerDestroyed()).toBe(true)
    expect(playerCondition.getHullPointsFraction()).toBe(0)
  })

  it('restoreForWaveRestart refills both shield and hull (death = restart wave, D2/D7)', () => {
    const playerCondition = createPlayerShipCondition()
    playerCondition.applyIncomingWeaponDamage(PLAYER_MAX_SHIELD_POINTS + PLAYER_MAX_HULL_POINTS, 10)
    expect(playerCondition.isPlayerDestroyed()).toBe(true)

    playerCondition.restoreForWaveRestart()

    expect(playerCondition.getShieldPointsFraction()).toBe(1)
    expect(playerCondition.getHullPointsFraction()).toBe(1)
    expect(playerCondition.isPlayerDestroyed()).toBe(false)
  })

  it('restoreForWaveRestart also clears the regen delay so a fresh hit behaves like the first ever hit', () => {
    const playerCondition = createPlayerShipCondition()
    playerCondition.applyIncomingWeaponDamage(80, 100)
    playerCondition.restoreForWaveRestart()

    // a new hit right after restart still blocks regeneration for the full delay window
    playerCondition.applyIncomingWeaponDamage(40, 100.5)
    playerCondition.updateShieldRegeneration(1, 100.5 + SHIELD_REGEN_DELAY_SECONDS - 0.001)
    expect(playerCondition.getShieldPointsFraction()).toBeCloseTo(60 / PLAYER_MAX_SHIELD_POINTS)
  })
})
