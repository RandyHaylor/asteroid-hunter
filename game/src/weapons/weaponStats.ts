import { weaponEngagementRanges } from '../gameSimulation/gameWorldTypes'
import type { EnemyShipBehaviorTier } from '../gameSimulation/gameWorldTypes'
import { playerEngagementRange } from '../shipStats'

// R17/R18: weapon behavior is fully data-driven so upgrades (fire rate, explosion
// radius, laser count and spread, etc.) plug in later by swapping/mutating stat blocks.

export type LaserWeaponStats = {
  fireCooldownSeconds: number
  boltSpeedMetersPerSecond: number
  boltDamage: number
  /** R18: upgrades can raise this to fire fanned multi-bolt volleys */
  simultaneousBoltCount: number
  /** total fan angle across the volley when simultaneousBoltCount > 1 */
  spreadAngleRadians: number
  /** R9: lasers are short range — bolts despawn past this distance */
  maxRangeMeters: number
}

export type MissileWeaponStats = {
  fireCooldownSeconds: number
  missileSpeedMetersPerSecond: number
  explosionRadiusMeters: number
  explosionDamage: number
  /** R18: weak homing steer toward the locked target after launch — upgrades raise the turn rate */
  homingTurnRateRadiansPerSecond: number
}

export const playerBaseLaserStats: LaserWeaponStats = {
  fireCooldownSeconds: 0.18,
  boltSpeedMetersPerSecond: 500,
  boltDamage: 8,
  simultaneousBoltCount: 1,
  spreadAngleRadians: 0,
  // D67: player laser reaches the combined radar+weapon engagement range (so locked targets up to that
  // range are actually hit). The combined RADAR+WEAPON RANGE upgrade keeps these two in sync.
  maxRangeMeters: playerEngagementRange.combinedRadarWeaponRangeMeters,
}

export const playerBaseMissileStats: MissileWeaponStats = {
  fireCooldownSeconds: 1.4,
  missileSpeedMetersPerSecond: 140,
  explosionRadiusMeters: 18,
  explosionDamage: 45,
  homingTurnRateRadiansPerSecond: 0.35, // D59: weaker homing to start (not overpowered) — upgradeable via MISSILE TRACKING
}

// D11: enemies fire the same weapon classes, tuned slightly weaker than the player's.
export const enemyBaseLaserStats: LaserWeaponStats = {
  fireCooldownSeconds: 0.5,
  boltSpeedMetersPerSecond: 500,
  boltDamage: 5,
  simultaneousBoltCount: 1,
  spreadAngleRadians: 0,
  maxRangeMeters: weaponEngagementRanges.laserShortRangeMeters,
}

export const enemyBaseMissileStats: MissileWeaponStats = {
  fireCooldownSeconds: 4,
  missileSpeedMetersPerSecond: 140,
  explosionRadiusMeters: 18,
  explosionDamage: 25,
  homingTurnRateRadiansPerSecond: 0.35, // D121: overridden per-archetype at spawn (see below) — base/fallback only
}

// D121: enemy missiles should home only WEAKLY, and weaker for lower-tier enemies, so the player can shake
// them. Each missile-firing archetype gets its own homing turn rate (rad/s), all well below the player base
// of 0.35. dumbPatrol (Drone) fires lasers only — never missiles — so its value is unused; returned as the
// weakest for safety. These are gameplay-feel starting points, tunable. The per-enemy missile stat block is
// built at spawn (main.ts) from enemyBaseMissileStats with this homing rate substituted.
export function enemyMissileHomingTurnRateForArchetype(behaviorTier: EnemyShipBehaviorTier): number {
  switch (behaviorTier) {
    case 'dumbPatrol':
      return 0 // never fires missiles; weakest as a safe default
    case 'orbitStrafe':
      return 0.08 // Raider — lowest missile-firing tier: barely curves, easy to outrun
    case 'coverHunter':
      return 0.18 // Stalker — strongest tier, still weak (< player 0.35)
  }
}
