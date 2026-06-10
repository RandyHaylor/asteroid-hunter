import type { Object3D, Quaternion, Vector3 } from 'three'

// Shared world vocabulary — every system codes against these contracts.

export type AsteroidSizeClass = 'large' | 'medium' | 'small'

export type AsteroidBody = {
  asteroidId: number
  sizeClass: AsteroidSizeClass
  positionMeters: Vector3
  velocityMetersPerSecond: Vector3
  /** current effective radius; shrinks as the asteroid is chipped (R12) */
  currentRadiusMeters: number
  massKg: number
  hitPointsRemaining: number
  isDestroyed: boolean
  renderObject: Object3D
}

export type EnemyShipBehaviorTier = 'dumbPatrol' | 'orbitStrafe' | 'coverHunter'

export type EnemyShip = {
  enemyShipId: number
  behaviorTier: EnemyShipBehaviorTier
  positionMeters: Vector3
  velocityMetersPerSecond: Vector3
  orientation: Quaternion
  hitPointsRemaining: number
  isDestroyed: boolean
  renderObject: Object3D
}

export type GameWorld = {
  asteroids: AsteroidBody[]
  enemyShips: EnemyShip[]
}

// R9: lasers are short range; missiles are long range (travel time, no hard distance limit).
// "missileEffectiveLongRangeMeters" is the in-sight threat distance used by cover logic (R8), not a flight cap.
export const weaponEngagementRanges = {
  laserShortRangeMeters: 280,
  missileEffectiveLongRangeMeters: 1000,
} as const
