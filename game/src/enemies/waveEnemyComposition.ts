import type { EnemyShipBehaviorTier } from '../gameSimulation/gameWorldTypes'

// D8/D72: the per-wave enemy roster. Archetype MIX escalates (Drones from wave 1, Raiders from wave 3,
// Stalkers from wave 5). D72: spawns ~3× as many enemies and KEEPS RAMPING with the wave — the old
// min(5) plateau is lifted to a high ceiling, so difficulty keeps scaling instead of flattening out.
const ENEMY_COUNT_PER_WAVE_MULTIPLIER = 3 // D72: 3× more enemies per wave than the original roster
const PER_TIER_COUNT_CEILING = 30 // perf safety valve — far above the old min(5) so it ramps for many waves

export function composeWaveEnemyBehaviorTiers(waveNumber: number): EnemyShipBehaviorTier[] {
  const behaviorTiers: EnemyShipBehaviorTier[] = []
  const dumbPatrolCount = (waveNumber <= 2 ? 2 + waveNumber : 2) * ENEMY_COUNT_PER_WAVE_MULTIPLIER
  const orbitStrafeCount =
    waveNumber >= 3 ? Math.min(PER_TIER_COUNT_CEILING, (waveNumber - 1) * ENEMY_COUNT_PER_WAVE_MULTIPLIER) : 0
  const coverHunterCount =
    waveNumber >= 5 ? Math.min(PER_TIER_COUNT_CEILING, (waveNumber - 4) * ENEMY_COUNT_PER_WAVE_MULTIPLIER) : 0
  for (let count = 0; count < dumbPatrolCount; count++) behaviorTiers.push('dumbPatrol')
  for (let count = 0; count < orbitStrafeCount; count++) behaviorTiers.push('orbitStrafe')
  for (let count = 0; count < coverHunterCount; count++) behaviorTiers.push('coverHunter')
  return behaviorTiers
}
