import { Vector3 } from 'three'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import type { ShipAutopilotSettings } from './shipAutopilotSettings'

// D74: the ship AUTOPILOT brain. Produces the same kind of inputs the player gives — a desired heading
// (to steer the constant momentum + aim), whether to thrust, and whether to latch an asteroid orbit to
// evade — from the world state + the player's tunable settings. Pure (writes into the out-intent, no
// allocations), so it's unit-testable. The integration layer (main.ts) applies the intent each frame.

export type AutopilotLatchCommand = 'latchNearestForEvasion' | 'release' | 'hold'

export type AutopilotIntent = {
  desiredHeadingDirectionWorld: Vector3
  thrustActive: boolean
  latchCommand: AutopilotLatchCommand
  isEvading: boolean
  /** the enemy it chose to engage (null while evading / idle) — for HUD/lock hints if wanted */
  engagedEnemyShipId: number | null
}

export function createAutopilotIntent(): AutopilotIntent {
  return {
    desiredHeadingDirectionWorld: new Vector3(0, 0, -1),
    thrustActive: false,
    latchCommand: 'hold',
    isEvading: false,
    engagedEnemyShipId: null,
  }
}

export type AutopilotContext = {
  playerPositionMeters: Vector3
  playerVelocityMetersPerSecond: Vector3
  enemyShips: readonly EnemyShip[]
  asteroids: readonly AsteroidBody[]
  shieldFraction: number
  recentlyDamaged: boolean
  /** combined radar+weapon range — the "in range" gate for counting threats + engaging */
  engagementRangeMeters: number
  /** hysteresis: was the autopilot evading last frame (so it waits for reEngageShieldFraction) */
  wasEvadingLastFrame: boolean
  settings: ShipAutopilotSettings
}

const ISOLATION_NEIGHBOR_RADIUS_METERS = 350 // enemies within this of a candidate count as "crowding" it
const EVASION_ORBIT_LATCH_RANGE_METERS = 600 // an asteroid within this (surface-ish) is worth orbiting to juke
const WORLD_UP_AXIS = new Vector3(0, 1, 0)

const scratchToTarget = new Vector3()
const scratchPlayerFromTarget = new Vector3()
const scratchApproachOffsetDirection = new Vector3()
const scratchApproachPoint = new Vector3()
const scratchFleeAccumulator = new Vector3()
const scratchEnemyDelta = new Vector3()

function countEnemiesInRange(context: AutopilotContext): number {
  let inRangeCount = 0
  for (const enemyShip of context.enemyShips) {
    if (enemyShip.isDestroyed) continue
    if (enemyShip.positionMeters.distanceTo(context.playerPositionMeters) <= context.engagementRangeMeters) {
      inRangeCount++
    }
  }
  return inRangeCount
}

/** prefer high-priority AND isolated enemies (so the ship fights 1–2 at a time using the field). */
function selectAutopilotTargetEnemy(context: AutopilotContext): EnemyShip | null {
  let bestEnemy: EnemyShip | null = null
  let bestScore = -Infinity
  for (const enemyShip of context.enemyShips) {
    if (enemyShip.isDestroyed) continue
    const distanceMeters = enemyShip.positionMeters.distanceTo(context.playerPositionMeters)
    if (distanceMeters > context.engagementRangeMeters) continue

    // base desirability in ~[0,1] by the chosen priority
    let priorityScore: number
    switch (context.settings.targetPriority) {
      case 'nearest':
        priorityScore = 1 - distanceMeters / context.engagementRangeMeters
        break
      case 'weakest':
        priorityScore = 1 - (enemyShip.shieldPointsRemaining + enemyShip.hitPointsRemaining) / 200
        break
      case 'mostDangerous':
        priorityScore = enemyShip.grappleStrength // Stalkers (1) > Raiders (0.5) > Drones (0)
        break
    }

    // isolation penalty: how many OTHER live enemies crowd this candidate (fraction of in-range pool)
    let crowdingNeighborCount = 0
    for (const otherEnemy of context.enemyShips) {
      if (otherEnemy === enemyShip || otherEnemy.isDestroyed) continue
      if (otherEnemy.positionMeters.distanceTo(enemyShip.positionMeters) <= ISOLATION_NEIGHBOR_RADIUS_METERS) {
        crowdingNeighborCount++
      }
    }
    const score = priorityScore - context.settings.isolationWeight * crowdingNeighborCount

    if (score > bestScore) {
      bestScore = score
      bestEnemy = enemyShip
    }
  }
  return bestEnemy
}

export function computeAutopilotIntent(context: AutopilotContext, outIntent: AutopilotIntent): void {
  const settings = context.settings
  const enemiesInRangeCount = countEnemiesInRange(context)

  // ---- decide: EVADE or ENGAGE ----
  const swarmedThreshold = enemiesInRangeCount > settings.maxEnemiesInRangeBeforeFlee
  const shieldLow = context.shieldFraction <= settings.shieldFractionBeforeEvasion
  const damageFlee = settings.fleeAfterAnyDamage && context.recentlyDamaged
  // hysteresis: once evading, keep evading until the shield recovers to the re-engage fraction
  const stillRecovering = context.wasEvadingLastFrame && context.shieldFraction < settings.reEngageShieldFraction
  const wantEvade = swarmedThreshold || shieldLow || damageFlee || stillRecovering

  if (wantEvade) {
    computeEvadeIntent(context, outIntent)
    return
  }

  const targetEnemy = selectAutopilotTargetEnemy(context)
  if (targetEnemy === null) {
    // nothing to fight — coast on current heading, don't thrust, release any orbit
    if (context.playerVelocityMetersPerSecond.lengthSq() > 1e-6) {
      outIntent.desiredHeadingDirectionWorld.copy(context.playerVelocityMetersPerSecond).normalize()
    }
    outIntent.thrustActive = false
    outIntent.latchCommand = 'release'
    outIntent.isEvading = false
    outIntent.engagedEnemyShipId = null
    return
  }
  computeEngageIntent(context, targetEnemy, outIntent)
}

function computeEvadeIntent(context: AutopilotContext, outIntent: AutopilotIntent): void {
  // flee AWAY from the crowd: sum of unit vectors pointing from each in-range enemy to the player
  scratchFleeAccumulator.set(0, 0, 0)
  for (const enemyShip of context.enemyShips) {
    if (enemyShip.isDestroyed) continue
    scratchEnemyDelta.copy(context.playerPositionMeters).sub(enemyShip.positionMeters)
    const distanceMeters = scratchEnemyDelta.length()
    if (distanceMeters > context.engagementRangeMeters || distanceMeters < 1e-6) continue
    scratchFleeAccumulator.addScaledVector(scratchEnemyDelta, 1 / (distanceMeters * distanceMeters)) // closer = stronger
  }
  if (scratchFleeAccumulator.lengthSq() > 1e-9) {
    outIntent.desiredHeadingDirectionWorld.copy(scratchFleeAccumulator).normalize()
  } else if (context.playerVelocityMetersPerSecond.lengthSq() > 1e-6) {
    outIntent.desiredHeadingDirectionWorld.copy(context.playerVelocityMetersPerSecond).normalize()
  }

  // juke into an asteroid orbit if one is near enough — orbiting helps shake pursuers + single them out
  let nearestAsteroidSurfaceDistance = Infinity
  for (const asteroid of context.asteroids) {
    if (asteroid.isDestroyed) continue
    const surfaceDistanceMeters =
      asteroid.positionMeters.distanceTo(context.playerPositionMeters) - asteroid.currentRadiusMeters
    if (surfaceDistanceMeters < nearestAsteroidSurfaceDistance) nearestAsteroidSurfaceDistance = surfaceDistanceMeters
  }
  outIntent.latchCommand =
    nearestAsteroidSurfaceDistance <= EVASION_ORBIT_LATCH_RANGE_METERS ? 'latchNearestForEvasion' : 'hold'
  outIntent.thrustActive = true
  outIntent.isEvading = true
  outIntent.engagedEnemyShipId = null
}

function computeEngageIntent(context: AutopilotContext, targetEnemy: EnemyShip, outIntent: AutopilotIntent): void {
  // approach the target from the PREFERRED ANGLE at the PREFERRED RANGE: take the target→player
  // direction, rotate it by the approach angle around world-up, and aim at that stand-off point.
  scratchPlayerFromTarget.copy(context.playerPositionMeters).sub(targetEnemy.positionMeters)
  if (scratchPlayerFromTarget.lengthSq() < 1e-9) scratchPlayerFromTarget.set(1, 0, 0)
  scratchPlayerFromTarget.normalize()
  scratchApproachOffsetDirection
    .copy(scratchPlayerFromTarget)
    .applyAxisAngle(WORLD_UP_AXIS, (context.settings.preferredApproachAngleDegrees * Math.PI) / 180)
  scratchApproachPoint
    .copy(targetEnemy.positionMeters)
    .addScaledVector(scratchApproachOffsetDirection, context.settings.preferredEngagementRangeMeters)

  scratchToTarget.copy(scratchApproachPoint).sub(context.playerPositionMeters)
  if (scratchToTarget.lengthSq() > 1e-9) {
    outIntent.desiredHeadingDirectionWorld.copy(scratchToTarget).normalize()
  }
  outIntent.thrustActive = true // steer the momentum toward the approach point
  outIntent.latchCommand = 'release' // don't orbit while pressing an attack
  outIntent.isEvading = false
  outIntent.engagedEnemyShipId = targetEnemy.enemyShipId
}
