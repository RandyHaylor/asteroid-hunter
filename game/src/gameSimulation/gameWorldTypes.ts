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
  /** D21: enemy shield absorbs damage before hull (hitPointsRemaining) */
  shieldPointsRemaining: number
  hitPointsRemaining: number
  isDestroyed: boolean
  renderObject: Object3D
  /** D68: ADDITIVE grapple ability layered on the behavior tier — 0 = cannot grapple, up to 1 = strong.
   *  Scales how often/long the enemy arcs (slingshots) off nearby asteroids during its normal behavior. */
  grappleStrength: number
  /** D70: the asteroid this enemy is CURRENTLY grappling (null when not), so the render layer can draw
   *  the visible grapple (fuzzy ring on the enemy + ring on the asteroid + connecting beam). */
  grappledAsteroid: AsteroidBody | null
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
