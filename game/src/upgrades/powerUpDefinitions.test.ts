import { describe, expect, it } from 'vitest'
import { ALL_POWER_UP_DEFINITIONS, selectDistinctPowerUps } from './powerUpDefinitions'

describe('ALL_POWER_UP_DEFINITIONS', () => {
  it('contains the requested power-ups with unique ids', () => {
    expect(ALL_POWER_UP_DEFINITIONS).toHaveLength(10) // D67: added RADAR+WEAPON RANGE
    const uniqueIds = new Set(ALL_POWER_UP_DEFINITIONS.map((p) => p.powerUpId))
    expect(uniqueIds.size).toBe(10)
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
    expect(iconMarkups.size).toBe(10) // each icon is distinct
  })
})

describe('selectDistinctPowerUps', () => {
  it('returns the requested count of DISTINCT power-ups', () => {
    // deterministic injected randomness: 0 each call picks index 0 from a shrinking list,
    // which must still yield distinct definitions (each pick is removed before the next)
    const offered = selectDistinctPowerUps(ALL_POWER_UP_DEFINITIONS, 3, () => 0)
    expect(offered).toHaveLength(3)
    const uniqueIds = new Set(offered.map((p) => p.powerUpId))
    expect(uniqueIds.size).toBe(3)
  })

  it('honors the injected random function to choose specific indices', () => {
    // first pick: 0.5 * 10 = index 5; after removal second pick: 0 -> index 0
    const sequence = [0.5, 0]
    let callIndex = 0
    const [first, second] = selectDistinctPowerUps(ALL_POWER_UP_DEFINITIONS, 2, () => sequence[callIndex++])
    expect(first.powerUpId).toBe(ALL_POWER_UP_DEFINITIONS[5].powerUpId)
    expect(second.powerUpId).toBe(ALL_POWER_UP_DEFINITIONS[0].powerUpId)
  })

  it('throws if given fewer power-ups than requested', () => {
    expect(() => selectDistinctPowerUps([ALL_POWER_UP_DEFINITIONS[0]], 2, () => 0)).toThrow()
  })
})
