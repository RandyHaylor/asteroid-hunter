import { describe, expect, it } from 'vitest'
import { ALL_POWER_UP_DEFINITIONS, selectTwoDistinctPowerUps } from './powerUpDefinitions'

describe('ALL_POWER_UP_DEFINITIONS', () => {
  it('contains the eight requested power-ups with unique ids', () => {
    expect(ALL_POWER_UP_DEFINITIONS).toHaveLength(9)
    const uniqueIds = new Set(ALL_POWER_UP_DEFINITIONS.map((p) => p.powerUpId))
    expect(uniqueIds.size).toBe(9)
  })

  it('every definition has a name, description, a unique-looking SVG icon, and an apply fn', () => {
    const iconMarkups = new Set<string>()
    for (const powerUp of ALL_POWER_UP_DEFINITIONS) {
      expect(powerUp.displayName.length).toBeGreaterThan(0)
      expect(powerUp.description.length).toBeGreaterThan(0)
      expect(powerUp.iconSvgMarkup).toContain('<svg')
      expect(typeof powerUp.applyToPlayerStats).toBe('function')
      iconMarkups.add(powerUp.iconSvgMarkup)
    }
    expect(iconMarkups.size).toBe(9) // each icon is distinct
  })
})

describe('selectTwoDistinctPowerUps', () => {
  it('returns two DISTINCT power-ups', () => {
    // deterministic injected randomness: 0 then 0 picks index 0 twice from a shrinking list,
    // which must still yield two different definitions (the first is removed before the second pick)
    const [first, second] = selectTwoDistinctPowerUps(ALL_POWER_UP_DEFINITIONS, () => 0)
    expect(first.powerUpId).not.toBe(second.powerUpId)
  })

  it('honors the injected random function to choose specific indices', () => {
    // first pick: 0.5 * 8 = index 4; after removal second pick: 0 -> index 0
    const sequence = [0.5, 0]
    let callIndex = 0
    const [first, second] = selectTwoDistinctPowerUps(ALL_POWER_UP_DEFINITIONS, () => sequence[callIndex++])
    expect(first.powerUpId).toBe(ALL_POWER_UP_DEFINITIONS[4].powerUpId)
    expect(second.powerUpId).toBe(ALL_POWER_UP_DEFINITIONS[0].powerUpId)
  })

  it('throws if given fewer than two power-ups', () => {
    expect(() => selectTwoDistinctPowerUps([ALL_POWER_UP_DEFINITIONS[0]], () => 0)).toThrow()
  })
})
