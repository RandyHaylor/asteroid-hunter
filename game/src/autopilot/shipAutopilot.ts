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
// D81: thrust is the ONLY way (besides orbiting) to change the travel direction — there's no air to bank
// against. So the AI thrusts whenever its CURRENT travel isn't within this angle of the desired heading,
// and coasts (straight line) when already aligned. It never relies on the field-edge corrective orbit.
const THRUST_STEER_ALIGNMENT_COSINE = Math.cos((12 * Math.PI) / 180)
// when idle (no target) and drifting past this distance from field center, head back in (under thrust)
const AUTOPILOT_FIELD_KEEP_IN_RADIUS_METERS = 1500
const scratchVelocityDirection = new Vector3()

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

  // each branch sets the desired HEADING + latch/state; the THRUST decision is made centrally below so
  // every course change is thrust-driven (the only legal way to change travel besides orbiting).
  if (wantEvade) {
    computeEvadeIntent(context, outIntent)
  } else {
    const targetEnemy = selectAutopilotTargetEnemy(context)
    if (targetEnemy === null) {
      computeIdleIntent(context, outIntent)
    } else {
      computeEngageIntent(context, targetEnemy, outIntent)
    }
  }

  // D81: THRUST to steer the travel toward the desired heading; coast only when already aligned. (When
  // the evade-orbit latch is engaged, the orbit controls motion and this thrust flag is moot.)
  outIntent.thrustActive = shouldThrustToSteerTravel(context, outIntent.desiredHeadingDirectionWorld)
}

/** thrust whenever current travel isn't aligned with the desired heading (or we have no momentum yet) */
function shouldThrustToSteerTravel(context: AutopilotContext, desiredHeadingWorld: Vector3): boolean {
  const speedMetersPerSecond = context.playerVelocityMetersPerSecond.length()
  if (speedMetersPerSecond < 1e-6) return true
  if (desiredHeadingWorld.lengthSq() < 1e-9) return false
  scratchVelocityDirection.copy(context.playerVelocityMetersPerSecond).divideScalar(speedMetersPerSecond)
  return scratchVelocityDirection.dot(desiredHeadingWorld) < THRUST_STEER_ALIGNMENT_COSINE
}

/** no enemies — hold heading, but steer back toward the field if drifting out (never use the edge-orbit) */
function computeIdleIntent(context: AutopilotContext, outIntent: AutopilotIntent): void {
  if (context.playerPositionMeters.length() > AUTOPILOT_FIELD_KEEP_IN_RADIUS_METERS) {
    scratchToTarget.copy(context.playerPositionMeters).multiplyScalar(-1) // head back toward field center
    if (scratchToTarget.lengthSq() > 1e-9) outIntent.desiredHeadingDirectionWorld.copy(scratchToTarget).normalize()
  } else if (context.playerVelocityMetersPerSecond.lengthSq() > 1e-6) {
    outIntent.desiredHeadingDirectionWorld.copy(context.playerVelocityMetersPerSecond).normalize()
  }
  outIntent.latchCommand = 'release'
  outIntent.isEvading = false
  outIntent.engagedEnemyShipId = null
}

function computeEvadeIntent(context: AutopilotContext, outIntent: AutopilotIntent): void {
  // EVADE by j: head toward the nearest asteroid and orbit it (orbiting shakes pursuers and keeps us
  // INSIDE the field). Only if there's genuinely no asteroid around do we flee away from the crowd —
  // we never run to the boundary to rely on the forced far-orbit.
  let nearestAsteroid: AsteroidBody | null = null
  let nearestSurfaceDistanceMeters = Infinity
  for (const asteroid of context.asteroids) {
    if (asteroid.isDestroyed) continue
    const surfaceDistanceMeters =
      asteroid.positionMeters.distanceTo(context.playerPositionMeters) - asteroid.currentRadiusMeters
    if (surfaceDistanceMeters < nearestSurfaceDistanceMeters) {
      nearestSurfaceDistanceMeters = surfaceDistanceMeters
      nearestAsteroid = asteroid
    }
  }

  if (nearestAsteroid) {
    // steer toward the asteroid; latch to orbit it once we're close enough
    scratchToTarget.copy(nearestAsteroid.positionMeters).sub(context.playerPositionMeters)
    if (scratchToTarget.lengthSq() > 1e-9) outIntent.desiredHeadingDirectionWorld.copy(scratchToTarget).normalize()
    outIntent.latchCommand =
      nearestSurfaceDistanceMeters <= EVASION_ORBIT_LATCH_RANGE_METERS ? 'latchNearestForEvasion' : 'hold'
  } else {
    // no asteroid in reach — flee directly away from the crowd (closer enemies push harder)
    scratchFleeAccumulator.set(0, 0, 0)
    for (const enemyShip of context.enemyShips) {
      if (enemyShip.isDestroyed) continue
      scratchEnemyDelta.copy(context.playerPositionMeters).sub(enemyShip.positionMeters)
      const distanceMeters = scratchEnemyDelta.length()
      if (distanceMeters < 1e-6) continue
      scratchFleeAccumulator.addScaledVector(scratchEnemyDelta, 1 / (distanceMeters * distanceMeters))
    }
    if (scratchFleeAccumulator.lengthSq() > 1e-9) {
      outIntent.desiredHeadingDirectionWorld.copy(scratchFleeAccumulator).normalize()
    }
    outIntent.latchCommand = 'hold'
  }
  outIntent.isEvading = true
  outIntent.engagedEnemyShipId = null
}

function computeEngageIntent(context: AutopilotContext, targetEnemy: EnemyShip, outIntent: AutopilotIntent): void {
  scratchToTarget.copy(targetEnemy.positionMeters).sub(context.playerPositionMeters)
  const distanceToTargetMeters = scratchToTarget.length()

  if (distanceToTargetMeters > context.settings.preferredEngagementRangeMeters) {
    // CLOSING: arc in from the preferred APPROACH ANGLE (aim at a stand-off point to the target's flank)
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
    if (scratchToTarget.lengthSq() > 1e-9) outIntent.desiredHeadingDirectionWorld.copy(scratchToTarget).normalize()
  } else {
    // IN FIRING RANGE: aim STRAIGHT at the enemy so it sits in the nose-cone lock and the ship auto-fires
    // (the central thrust logic coasts once our momentum already points at it — a strafing pass)
    if (distanceToTargetMeters > 1e-6) outIntent.desiredHeadingDirectionWorld.copy(scratchToTarget).divideScalar(distanceToTargetMeters)
  }
  outIntent.latchCommand = 'release' // don't orbit while pressing an attack
  outIntent.isEvading = false
  outIntent.engagedEnemyShipId = targetEnemy.enemyShipId
}
