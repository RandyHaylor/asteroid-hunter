import { Vector3 } from 'three'
import { weaponEngagementRanges } from '../gameSimulation/gameWorldTypes'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import { isLineOfSightBlockedByAsteroids } from '../gameSimulation/lineOfSightProbe'
import { solveCoverPositionBehindAsteroid } from './coverPositionSolver'

// R8/R9: grades the cover an asteroid would give the player right now.
// red    = a short-range laser enemy has a clear line to the solved cover point
// yellow = only long-range missile enemies have a clear line
// normal = every in-range enemy's line of sight is blocked

export type CoverQuality = 'fullCover' | 'exposedToLongRangeEnemies' | 'exposedToShortRangeEnemies'

// scratch object reused every call to avoid per-frame allocations
const scratchSolvedCoverPoint = new Vector3()

export function evaluateCoverQualityForAsteroid(
  coverAsteroid: AsteroidBody,
  enemyShips: readonly EnemyShip[],
  playerPositionMeters: Vector3,
  playerFacingDirection: Vector3,
  allAsteroids: readonly AsteroidBody[],
): CoverQuality {
  // STEP 1: where would the tractor beam park the player behind this asteroid? (reuse the R7 solver)
  solveCoverPositionBehindAsteroid(
    coverAsteroid,
    enemyShips,
    playerPositionMeters,
    playerFacingDirection,
    scratchSolvedCoverPoint,
  )

  // STEP 2: test every alive in-range enemy's line of sight to that cover point (R8).
  // An unblocked short-range (laser) threat outranks any long-range (missile) verdict.
  let hasUnblockedLongRangeThreat = false
  for (const enemy of enemyShips) {
    if (enemy.isDestroyed) continue
    const enemyDistanceToCoverMeters = enemy.positionMeters.distanceTo(scratchSolvedCoverPoint)
    if (enemyDistanceToCoverMeters > weaponEngagementRanges.missileEffectiveLongRangeMeters) continue
    if (isLineOfSightBlockedByAsteroids(enemy.positionMeters, scratchSolvedCoverPoint, allAsteroids)) continue

    if (enemyDistanceToCoverMeters <= weaponEngagementRanges.laserShortRangeMeters) {
      return 'exposedToShortRangeEnemies'
    }
    hasUnblockedLongRangeThreat = true
  }

  return hasUnblockedLongRangeThreat ? 'exposedToLongRangeEnemies' : 'fullCover'
}
