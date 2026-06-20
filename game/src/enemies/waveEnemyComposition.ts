import type { EnemyShipBehaviorTier } from '../gameSimulation/gameWorldTypes'

// D8/D73: the per-wave enemy roster. Difficulty is driven mainly by the harder ARCHETYPE MIX escalating
// (Drones from wave 1, Raiders from wave 3, Stalkers from wave 5 — Raiders/Stalkers grapple and are
// tougher). Raw COUNT grows only GENTLY per wave (D73 walked back D72's 3× spawn, which was too steep);
// roughly +1 of a tier every couple of waves, capped, so the swarm size creeps up rather than exploding.
const DRONE_COUNT_AFTER_EARLY_WAVES = 3
const PER_TIER_GENTLE_RAMP_WAVES_PER_EXTRA = 2 // ~+1 enemy of a tier every 2 waves
const PER_TIER_COUNT_CEILING = 8

export function composeWaveEnemyBehaviorTiers(waveNumber: number): EnemyShipBehaviorTier[] {
  const behaviorTiers: EnemyShipBehaviorTier[] = []
  const dumbPatrolCount = waveNumber <= 2 ? 2 + waveNumber : DRONE_COUNT_AFTER_EARLY_WAVES
  const orbitStrafeCount =
    waveNumber >= 3
      ? Math.min(PER_TIER_COUNT_CEILING, Math.ceil((waveNumber - 2) / PER_TIER_GENTLE_RAMP_WAVES_PER_EXTRA))
      : 0
  const coverHunterCount =
    waveNumber >= 5
      ? Math.min(PER_TIER_COUNT_CEILING, Math.ceil((waveNumber - 4) / PER_TIER_GENTLE_RAMP_WAVES_PER_EXTRA))
      : 0
  for (let count = 0; count < dumbPatrolCount; count++) behaviorTiers.push('dumbPatrol')
  for (let count = 0; count < orbitStrafeCount; count++) behaviorTiers.push('orbitStrafe')
  for (let count = 0; count < coverHunterCount; count++) behaviorTiers.push('coverHunter')
  return behaviorTiers
}
