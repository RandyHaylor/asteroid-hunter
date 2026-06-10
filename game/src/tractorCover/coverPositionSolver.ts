import { Vector3 } from 'three'
import { weaponEngagementRanges } from '../gameSimulation/gameWorldTypes'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'

// R7: cover position solver — picks the point behind a large asteroid that best hides the player.
// No threats within missile range of the asteroid → hide along the player's facing direction (default).
// Threats present → oppose the proximity-weighted average threat direction, then CLAMP the hide
// direction so the CLOSEST enemy is always fully hidden, sacrificing average-hiding from farther ones.

const MINIMUM_STANDOFF_CLEARANCE_METERS = 8
const STANDOFF_CLEARANCE_RADIUS_FRACTION = 0.35
/** extra rotation past the geometric full-hide threshold so the LOS check clears with margin (R7 clamp) */
const FULL_HIDE_SAFETY_MARGIN_RADIANS = 0.05

// scratch objects reused every call to avoid per-frame allocations in the hot simulation path
const scratchThreatAxis = new Vector3()
const scratchEnemyDirection = new Vector3()
const scratchClosestEnemyDirection = new Vector3()
const scratchHideDirection = new Vector3()
const scratchClampRotationAxis = new Vector3()

/** D14: the hold-shell radius around an asteroid — also the distance every solved cover point sits at */
export function computeCoverHoldShellRadiusMeters(coverAsteroid: AsteroidBody): number {
  const standoffClearanceMeters = Math.max(
    MINIMUM_STANDOFF_CLEARANCE_METERS,
    coverAsteroid.currentRadiusMeters * STANDOFF_CLEARANCE_RADIUS_FRACTION,
  )
  return coverAsteroid.currentRadiusMeters + standoffClearanceMeters
}

export function solveCoverPositionBehindAsteroid(
  coverAsteroid: AsteroidBody,
  enemyShips: readonly EnemyShip[],
  playerPositionMeters: Vector3,
  playerFacingDirection: Vector3,
  outCoverPoint: Vector3,
): Vector3 {
  const asteroidCenter = coverAsteroid.positionMeters
  const coverDistanceFromCenterMeters = computeCoverHoldShellRadiusMeters(coverAsteroid)

  // STEP 1: accumulate the threat axis from alive enemies within missile threat range of the asteroid (R9),
  // weighting each enemy's direction by 1/distance² so closer enemies dominate (R7)
  scratchThreatAxis.set(0, 0, 0)
  let closestEnemy: EnemyShip | null = null
  let closestEnemyDistanceMeters = Infinity
  for (const enemy of enemyShips) {
    if (enemy.isDestroyed) continue
    const enemyDistanceMeters = enemy.positionMeters.distanceTo(asteroidCenter)
    if (enemyDistanceMeters > weaponEngagementRanges.missileEffectiveLongRangeMeters) continue

    scratchEnemyDirection.copy(enemy.positionMeters).sub(asteroidCenter)
    if (enemyDistanceMeters > 1e-6) scratchEnemyDirection.divideScalar(enemyDistanceMeters)
    const proximityWeight = 1 / Math.max(enemyDistanceMeters * enemyDistanceMeters, 1)
    scratchThreatAxis.addScaledVector(scratchEnemyDirection, proximityWeight)

    if (enemyDistanceMeters < closestEnemyDistanceMeters) {
      closestEnemyDistanceMeters = enemyDistanceMeters
      closestEnemy = enemy
    }
  }

  // STEP 2: no threats in range → default cover on the far side along the player's facing direction (R7)
  if (closestEnemy === null) {
    scratchHideDirection.copy(playerFacingDirection)
    if (scratchHideDirection.lengthSq() < 1e-9) {
      // degenerate facing input — treat "toward the asteroid" as the facing direction
      scratchHideDirection.copy(asteroidCenter).sub(playerPositionMeters)
    }
    if (scratchHideDirection.lengthSq() < 1e-9) scratchHideDirection.set(0, 0, -1)
    scratchHideDirection.normalize()
    return outCoverPoint.copy(asteroidCenter).addScaledVector(scratchHideDirection, coverDistanceFromCenterMeters)
  }

  // STEP 3: hide direction opposes the weighted threat axis (cover point = center − threatAxis × distance)
  if (scratchThreatAxis.lengthSq() < 1e-9) {
    // opposing threats cancelled out — fall back to hiding from the closest enemy alone
    scratchThreatAxis.copy(closestEnemy.positionMeters).sub(asteroidCenter)
  }
  scratchThreatAxis.normalize()
  scratchHideDirection.copy(scratchThreatAxis).negate()

  // STEP 4 (R7 clamp): the CLOSEST enemy must be fully hidden — the angle between the hide direction
  // and the direction to the closest enemy must exceed 90° plus the asteroid's angular radius as seen
  // from the cover point; otherwise rotate the hide direction away from the closest enemy just enough
  scratchClosestEnemyDirection.copy(closestEnemy.positionMeters).sub(asteroidCenter).normalize()
  const asteroidAngularRadiusRadians = Math.asin(
    Math.min(1, coverAsteroid.currentRadiusMeters / coverDistanceFromCenterMeters),
  )
  const requiredSeparationRadians =
    Math.PI / 2 + asteroidAngularRadiusRadians + FULL_HIDE_SAFETY_MARGIN_RADIANS
  const currentSeparationRadians = scratchHideDirection.angleTo(scratchClosestEnemyDirection)
  if (currentSeparationRadians < requiredSeparationRadians) {
    // rotate in the plane shared by the hide direction and the closest-enemy direction
    scratchClampRotationAxis.crossVectors(scratchClosestEnemyDirection, scratchHideDirection)
    if (scratchClampRotationAxis.lengthSq() < 1e-9) {
      // hide direction is parallel to the enemy direction — any perpendicular axis works
      scratchClampRotationAxis.set(0, 1, 0).cross(scratchClosestEnemyDirection)
      if (scratchClampRotationAxis.lengthSq() < 1e-9) {
        scratchClampRotationAxis.set(1, 0, 0).cross(scratchClosestEnemyDirection)
      }
    }
    scratchClampRotationAxis.normalize()
    // positive rotation around (enemyDir × hideDir) opens the angle away from the closest enemy
    scratchHideDirection.applyAxisAngle(
      scratchClampRotationAxis,
      requiredSeparationRadians - currentSeparationRadians,
    )
  }

  // STEP 5: cover point sits standoff-clear of the surface on the hidden side
  return outCoverPoint.copy(asteroidCenter).addScaledVector(scratchHideDirection, coverDistanceFromCenterMeters)
}
