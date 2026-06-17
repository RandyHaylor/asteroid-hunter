import { weaponEngagementRanges } from '../gameSimulation/gameWorldTypes'

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
  maxRangeMeters: weaponEngagementRanges.laserShortRangeMeters,
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
  homingTurnRateRadiansPerSecond: 0.35,
}
