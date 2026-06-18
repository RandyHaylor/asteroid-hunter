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

  it('spawns ~3× the original roster (original w5 was 2+4+1=7 → now 21)', () => {
    // original formula: drones 2, raiders min(5,4)=4, stalkers min(5,1)=1 → 7; ×3 = 21
    expect(countByTier(5).total).toBe(21)
  })

  it('keeps ramping with the wave (no early plateau) deep past the old min(5) cap', () => {
    // the old roster plateaued at wave ~6 (raiders+stalkers capped at 5 each); now it keeps growing
    expect(countByTier(9).total).toBeGreaterThan(countByTier(6).total)
    expect(countByTier(6).total).toBeGreaterThan(countByTier(5).total)
  })

  it('caps each tier at the perf ceiling (30) at very high waves', () => {
    const veryHigh = countByTier(100)
    expect(veryHigh.raiders).toBe(30)
    expect(veryHigh.stalkers).toBe(30)
  })
})
