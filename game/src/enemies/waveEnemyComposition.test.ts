import { describe, expect, it } from 'vitest'
import { composeWaveEnemyBehaviorTiers } from './waveEnemyComposition'

function countByTier(waveNumber: number) {
  const roster = composeWaveEnemyBehaviorTiers(waveNumber)
  return {
    total: roster.length,
    drones: roster.filter((t) => t === 'dumbPatrol').length,
    raiders: roster.filter((t) => t === 'orbitStrafe').length,
    stalkers: roster.filter((t) => t === 'coverHunter').length,
  }
}

describe('composeWaveEnemyBehaviorTiers (D72)', () => {
  it('escalates the archetype mix: Drones from w1, Raiders from w3, Stalkers from w5', () => {
    expect(countByTier(1).raiders).toBe(0)
    expect(countByTier(1).stalkers).toBe(0)
    expect(countByTier(3).raiders).toBeGreaterThan(0)
    expect(countByTier(4).stalkers).toBe(0)
    expect(countByTier(5).stalkers).toBeGreaterThan(0)
  })

  it('keeps the swarm SMALL — counts ramp gently (D73), not the steep D72 3×', () => {
    // gentle: ~+1 of a tier every couple of waves. w5 stays a handful (was 21 under the D72 3×).
    expect(countByTier(5).total).toBeLessThanOrEqual(8)
    // grows over a few waves rather than per-wave-monotonic (steps every 2 waves)
    expect(countByTier(5).total).toBeGreaterThan(countByTier(3).total)
    expect(countByTier(7).total).toBeGreaterThan(countByTier(5).total)
  })

  it('caps each tier at the perf ceiling (8) at very high waves', () => {
    const veryHigh = countByTier(100)
    expect(veryHigh.raiders).toBe(8)
    expect(veryHigh.stalkers).toBe(8)
  })
})
