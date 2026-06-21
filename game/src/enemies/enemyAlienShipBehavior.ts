import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Scene } from 'three'
import type { AsteroidBody, EnemyShip, EnemyShipBehaviorTier } from '../gameSimulation/gameWorldTypes'
import { weaponEngagementRanges } from '../gameSimulation/gameWorldTypes'
import { isLineOfSightBlockedByAsteroids } from '../gameSimulation/lineOfSightProbe'
import { computeOrbitStep } from '../grappleOrbit/computeOrbitStep'
import { createEnemyShipMesh } from './enemyShipMesh'
import { ENEMY_SHIP_MAX_HULL_POINTS, ENEMY_SHIP_MAX_SHIELD_POINTS } from './enemyShipDamage'

// D8: enemy AI tiers — dumbPatrol wanders and snap-fires, orbitStrafe circles the player,
// coverHunter hides behind large asteroids and peeks out to attack (D11 degrades that cover over time).
// R2: enemies fly the same target-velocity physics model as the player so motion feels consistent.

export type EnemyFireIntent = {
  wantsToFireLaser: boolean
  wantsToFireMissile: boolean
  aimDirectionWorld: Vector3
}

export function createEnemyFireIntent(): EnemyFireIntent {
  return { wantsToFireLaser: false, wantsToFireMissile: false, aimDirectionWorld: new Vector3(0, 0, -1) }
}

// ---- movement tuning (shared by all tiers) ----
const MAX_STEERING_ACCELERATION_METERS_PER_SECOND_SQUARED = 40
/** how aggressively thrust corrects toward the desired velocity (1/seconds), like the player physics */
const VELOCITY_CORRECTION_GAIN_PER_SECOND = 2
/** desired speed ramps down as distanceToGoal * this gain so enemies settle at loiter points (1/seconds) */
const ARRIVAL_BRAKING_GAIN_PER_SECOND = 1
// D46: enemies turn more slowly (lazier, longer arcs)
const MAX_TURN_RATE_RADIANS_PER_SECOND = 1.2
/** below this speed the ship holds its heading instead of chasing velocity noise */
const MIN_SPEED_FOR_TRAVEL_FACING_METERS_PER_SECOND = 0.5

// ---- dumbPatrol tuning (D8) ----
// D46: patrol waypoints reach much farther, so enemies fly away for longer between turns
const PATROL_WANDER_SPHERE_RADIUS_METERS = 1300
const PATROL_WAYPOINT_ARRIVAL_RADIUS_METERS = 30
const PATROL_CRUISE_SPEED_METERS_PER_SECOND = 45 // D85: +50% from 30 (base speeds bumped to reduce sluggishness)
/** only fires when the player is roughly ahead: within ~25° of the nose */
const PATROL_FIRING_CONE_COSINE = Math.cos((25 * Math.PI) / 180)

// ---- orbitStrafe tuning (D8) ----
const ORBIT_STANDOFF_RADIUS_METERS = 380 // D46: orbit/strafe farther out (longer passes away)
const ORBIT_CRUISE_SPEED_METERS_PER_SECOND = 75 // D85: +50% from 50
/** tangential lead distance that keeps the goal point sliding around the orbit circle */
const ORBIT_TANGENTIAL_LEAD_METERS = 120

// ---- missile envelope (R9: travel time makes point-blank missiles useless) ----
const MISSILE_MINIMUM_RANGE_METERS = 250
const MISSILE_MAXIMUM_RANGE_METERS = 900

// ---- coverHunter tuning (D8, D11) ----
const COVER_HIDE_STANDOFF_METERS = 12
const COVER_CRUISE_SPEED_METERS_PER_SECOND = 75 // D85: +50% from 50
// D67: peek more often so a cover hunter keeps ATTACKING intermittently instead of hiding-and-waiting
const COVER_PEEK_INTERVAL_MIN_SECONDS = 2.5
const COVER_PEEK_INTERVAL_MAX_SECONDS = 4.5
const COVER_PEEK_DURATION_SECONDS = 2
/** lateral clearance past the asteroid rim when peeking out */
const COVER_PEEK_RIM_CLEARANCE_METERS = 20
/** D11: chipped cover shrinking below this fraction of its chosen radius forces relocation */
const COVER_REPICK_SHRINK_FRACTION = 0.6
// D67: a cover hunter periodically advances — re-picking cover that is closer to the player, but only
// among rocks within one "step" of its current spot, so it ladders inward across the field over time.
const COVER_ADVANCE_RECONSIDER_SECONDS = 6
const COVER_ADVANCE_MAX_STEP_METERS = 700

// ---- D67: attack-the-orbited-asteroid behavior ----
// If an enemy keeps shooting at the player while the player ORBITS an asteroid (shots that can't
// connect), after this many continuous seconds it switches to blasting that asteroid instead.
const ASTEROID_ATTACK_MISS_THRESHOLD_SECONDS = 3
// It keeps attacking the rock while the player orbits, and for this long after the player stops.
const ASTEROID_ATTACK_PERSIST_AFTER_ORBIT_SECONDS = 3

// ---- D68: ADDITIVE enemy grapple ability (layered on every tier; never replaces tier behavior) ----
// An enemy with grappleStrength > 0 periodically latches a nearby large asteroid and arcs (slingshots)
// around it for a while, then releases keeping the tangential velocity — woven INTO its normal behavior
// (it still aims/fires per its tier; facing is unaffected, like the player's grapple).
const GRAPPLE_LATCH_MAX_CENTER_DISTANCE_METERS = 240 // must be at least this close to a large rock to latch
const GRAPPLE_MIN_ORBIT_RADIUS_METERS = 30 // never latch tighter than this
const GRAPPLE_BASE_ARC_SECONDS = 1.5 // arc duration = base + scale*strength (stronger = longer arcs)
const GRAPPLE_ARC_SECONDS_PER_STRENGTH = 2.0
const GRAPPLE_BASE_COOLDOWN_SECONDS = 5.0 // cooldown = base - scale*strength (stronger = grapples more often)
const GRAPPLE_COOLDOWN_SECONDS_PER_STRENGTH = 2.5

/**
 * D70: grapple strength is now bundled into the ARCHETYPE (= behavior tier), not a per-wave scalar.
 * Drone (dumbPatrol) never grapples; Raider (orbitStrafe) weak; Stalker (coverHunter) strong. Waves
 * still escalate the MIX of archetypes (composeWaveEnemyBehaviorTiers), so grapple ramps in naturally.
 * @returns 0 (none), 0.5 (weak), or 1 (strong)
 */
export function grappleStrengthForArchetype(behaviorTier: EnemyShipBehaviorTier): number {
  switch (behaviorTier) {
    case 'dumbPatrol':
      return 0
    case 'orbitStrafe':
      return 0.5
    case 'coverHunter':
      return 1
  }
}

type EnemyBehaviorInternalState = {
  patrolWaypointMeters: Vector3
  hasPatrolWaypoint: boolean
  coverAsteroid: AsteroidBody | null
  coverAsteroidRadiusWhenChosenMeters: number
  hidePointMeters: Vector3
  peekGoalPointMeters: Vector3
  secondsUntilNextPeek: number
  peekSecondsRemaining: number
  isPeeking: boolean
  // D67: cover hunters periodically advance toward the player by re-picking closer cover
  secondsUntilCoverAdvance: number
  // D67: attack-the-orbited-asteroid tracking
  secondsShootingWhilePlayerOrbiting: number
  asteroidAttackTarget: AsteroidBody | null
  asteroidAttackPersistSecondsRemaining: number
  // D68: additive grapple-arc state (woven into the tier behavior)
  isGrappling: boolean
  grappleAsteroid: AsteroidBody | null
  grappleOrbitAxisUnit: Vector3
  grappleOrbitRadiusMeters: number
  grappleArcSecondsRemaining: number
  grappleCooldownSecondsRemaining: number
}

// per-enemy internal state lives outside the shared EnemyShip contract, keyed by the ship object
const enemyShipInternalStates = new WeakMap<EnemyShip, EnemyBehaviorInternalState>()

function getOrCreateInternalState(enemyShip: EnemyShip): EnemyBehaviorInternalState {
  let internalState = enemyShipInternalStates.get(enemyShip)
  if (!internalState) {
    internalState = {
      patrolWaypointMeters: new Vector3(),
      hasPatrolWaypoint: false,
      coverAsteroid: null,
      coverAsteroidRadiusWhenChosenMeters: 0,
      hidePointMeters: new Vector3(),
      peekGoalPointMeters: new Vector3(),
      secondsUntilNextPeek: 0,
      peekSecondsRemaining: 0,
      isPeeking: false,
      secondsUntilCoverAdvance: COVER_ADVANCE_RECONSIDER_SECONDS,
      secondsShootingWhilePlayerOrbiting: 0,
      asteroidAttackTarget: null,
      asteroidAttackPersistSecondsRemaining: 0,
      isGrappling: false,
      grappleAsteroid: null,
      grappleOrbitAxisUnit: new Vector3(0, 1, 0),
      grappleOrbitRadiusMeters: 0,
      grappleArcSecondsRemaining: 0,
      grappleCooldownSecondsRemaining: 0,
    }
    enemyShipInternalStates.set(enemyShip, internalState)
  }
  return internalState
}

let nextEnemyShipId = 1

export function createEnemyShip(
  behaviorTier: EnemyShipBehaviorTier,
  spawnPositionMeters: Vector3,
  gameScene: Scene,
): EnemyShip {
  // D70: the mesh look AND the grapple strength are both derived from the archetype (behavior tier)
  const enemyShipMesh = createEnemyShipMesh(behaviorTier)
  enemyShipMesh.position.copy(spawnPositionMeters)
  gameScene.add(enemyShipMesh)

  return {
    enemyShipId: nextEnemyShipId++,
    behaviorTier,
    positionMeters: spawnPositionMeters.clone(),
    velocityMetersPerSecond: new Vector3(),
    orientation: new Quaternion(),
    shieldPointsRemaining: ENEMY_SHIP_MAX_SHIELD_POINTS,
    hitPointsRemaining: ENEMY_SHIP_MAX_HULL_POINTS,
    isDestroyed: false,
    renderObject: enemyShipMesh,
    grappleStrength: grappleStrengthForArchetype(behaviorTier),
    grappledAsteroid: null,
  }
}

/**
 * D8/R7-adjacent local math: the hide point sits on the far side of the asteroid from the player,
 * standing off the surface. Deliberately NOT shared with the player's tractorCover solver.
 */
export function computeCoverHidePointBehindAsteroid(
  coverAsteroid: AsteroidBody,
  playerPositionMeters: Vector3,
  outHidePointMeters: Vector3,
): Vector3 {
  outHidePointMeters.copy(coverAsteroid.positionMeters).sub(playerPositionMeters)
  if (outHidePointMeters.lengthSq() < 1e-9) outHidePointMeters.set(0, 0, 1)
  return outHidePointMeters
    .normalize()
    .multiplyScalar(coverAsteroid.currentRadiusMeters + COVER_HIDE_STANDOFF_METERS)
    .add(coverAsteroid.positionMeters)
}

const ENEMY_LOCAL_FORWARD_AXIS = new Vector3(0, 0, -1)
const WORLD_UP_AXIS = new Vector3(0, 1, 0)
const WORLD_RIGHT_AXIS = new Vector3(1, 0, 0)
const WORLD_ORIGIN = new Vector3(0, 0, 0)

// scratch objects reused every update to avoid per-frame allocations in the hot AI path
const scratchVectorToPlayer = new Vector3()
const scratchVectorToAsteroidTarget = new Vector3() // D67: aim toward the orbited asteroid under attack
const scratchNoseFacingDirection = new Vector3()
// D68: grapple-weave scratch (latch geometry + orbit-step outputs)
const scratchGrappleRadiusVector = new Vector3()
const scratchGrappleAxis = new Vector3()
const scratchGrappleOutPosition = new Vector3()
const scratchGrappleOutVelocity = new Vector3()
const scratchGoalPoint = new Vector3()
const scratchDesiredVelocity = new Vector3()
const scratchSteeringAcceleration = new Vector3()
const scratchOrbitRadialDirection = new Vector3()
const scratchOrbitTangentDirection = new Vector3()
const scratchPeekSideDirection = new Vector3()
const scratchTravelFacingDirection = new Vector3()
const scratchLookAtMatrix = new Matrix4()
const scratchTargetOrientation = new Quaternion()

export function updateEnemyShipBehavior(
  enemyShip: EnemyShip,
  asteroids: readonly AsteroidBody[],
  playerPositionMeters: Vector3,
  deltaSeconds: number,
  outFireIntent: EnemyFireIntent,
  // D67: the asteroid the player is currently orbiting (null if not orbiting), so enemies can switch
  // to destroying it after repeatedly failing to hit the orbiting player.
  playerOrbitedAsteroid: AsteroidBody | null = null,
): void {
  // STEP 1: reset intent; destroyed enemies do nothing (the caller marks isDestroyed)
  outFireIntent.wantsToFireLaser = false
  outFireIntent.wantsToFireMissile = false
  if (enemyShip.isDestroyed) return

  const internalState = getOrCreateInternalState(enemyShip)

  // STEP 2: aim straight at the player (integration layer adds projectile speed; no lead in v1)
  scratchVectorToPlayer.copy(playerPositionMeters).sub(enemyShip.positionMeters)
  const distanceToPlayerMeters = scratchVectorToPlayer.length()
  if (distanceToPlayerMeters > 1e-6) {
    outFireIntent.aimDirectionWorld.copy(scratchVectorToPlayer).divideScalar(distanceToPlayerMeters)
  } else {
    outFireIntent.aimDirectionWorld.copy(ENEMY_LOCAL_FORWARD_AXIS).applyQuaternion(enemyShip.orientation)
  }
  const isPlayerInClearSight = !isLineOfSightBlockedByAsteroids(
    enemyShip.positionMeters,
    playerPositionMeters,
    asteroids,
  )

  // STEP 3: tier-specific goal point + fire intent (D8)
  let cruiseSpeedMetersPerSecond: number
  switch (enemyShip.behaviorTier) {
    case 'dumbPatrol':
      cruiseSpeedMetersPerSecond = updateDumbPatrolTier(
        enemyShip, internalState, distanceToPlayerMeters, isPlayerInClearSight, outFireIntent, scratchGoalPoint,
      )
      break
    case 'orbitStrafe':
      cruiseSpeedMetersPerSecond = updateOrbitStrafeTier(
        enemyShip, playerPositionMeters, distanceToPlayerMeters, isPlayerInClearSight, outFireIntent, scratchGoalPoint,
      )
      break
    case 'coverHunter':
      cruiseSpeedMetersPerSecond = updateCoverHunterTier(
        enemyShip, internalState, asteroids, playerPositionMeters, distanceToPlayerMeters,
        isPlayerInClearSight, deltaSeconds, outFireIntent, scratchGoalPoint,
      )
      break
  }

  // STEP 3.5 (D67): switch to blasting the asteroid the player is orbiting, once this enemy has spent
  // long enough shooting at the (un-hittable) orbiting player. This OVERRIDES the tier's player aim.
  updateAsteroidAttackOverride(enemyShip, internalState, playerOrbitedAsteroid, deltaSeconds, outFireIntent)

  // STEP 3.6 (D68): ADDITIVE grapple — if able, arc (slingshot) off a nearby asteroid woven into the
  // tier behavior. While grappling, the arc controls position/velocity, so the normal steer is skipped.
  const isGrapplingThisFrame = updateEnemyGrappleWeave(
    enemyShip, internalState, asteroids, deltaSeconds, cruiseSpeedMetersPerSecond,
  )

  // STEP 4: steer by target velocity toward the goal, thrust-limited like the player physics (R3/D12)
  if (!isGrapplingThisFrame) {
    steerEnemyTowardGoalPoint(enemyShip, scratchGoalPoint, cruiseSpeedMetersPerSecond, deltaSeconds)
  }

  // STEP 5: face the player while shooting, otherwise face the travel direction
  if (outFireIntent.wantsToFireLaser || outFireIntent.wantsToFireMissile) {
    turnEnemyTowardFacingDirection(enemyShip, outFireIntent.aimDirectionWorld, deltaSeconds)
  } else if (
    enemyShip.velocityMetersPerSecond.lengthSq() >
    MIN_SPEED_FOR_TRAVEL_FACING_METERS_PER_SECOND * MIN_SPEED_FOR_TRAVEL_FACING_METERS_PER_SECOND
  ) {
    scratchTravelFacingDirection.copy(enemyShip.velocityMetersPerSecond).normalize()
    turnEnemyTowardFacingDirection(enemyShip, scratchTravelFacingDirection, deltaSeconds)
  }

  // STEP 6: sync the render object with the simulated rigid body
  enemyShip.renderObject.position.copy(enemyShip.positionMeters)
  enemyShip.renderObject.quaternion.copy(enemyShip.orientation)
}

// ---- D67: attack-the-orbited-asteroid override ----

/**
 * Tracks how long this enemy has been shooting at the player while the player orbits an asteroid; once
 * past the threshold it latches onto that asteroid and overrides the fire intent to destroy it. The
 * attack persists while the player keeps orbiting it, and for a few seconds after (or until the rock
 * is gone). On entry `outFireIntent` already targets the player (tier logic); on a latched attack we
 * re-point the aim + fire flags at the asteroid.
 */
function updateAsteroidAttackOverride(
  enemyShip: EnemyShip,
  internalState: EnemyBehaviorInternalState,
  playerOrbitedAsteroid: AsteroidBody | null,
  deltaSeconds: number,
  outFireIntent: EnemyFireIntent,
): void {
  const isShootingAtPlayerNow = outFireIntent.wantsToFireLaser || outFireIntent.wantsToFireMissile

  // accumulate CONTINUOUS "shooting while the player orbits" time — resets the instant either stops
  if (playerOrbitedAsteroid && !playerOrbitedAsteroid.isDestroyed && isShootingAtPlayerNow) {
    internalState.secondsShootingWhilePlayerOrbiting += deltaSeconds
  } else if (internalState.asteroidAttackTarget === null) {
    internalState.secondsShootingWhilePlayerOrbiting = 0
  }

  // cross the threshold → latch the orbited asteroid as the attack target
  if (
    internalState.asteroidAttackTarget === null &&
    playerOrbitedAsteroid &&
    !playerOrbitedAsteroid.isDestroyed &&
    internalState.secondsShootingWhilePlayerOrbiting >= ASTEROID_ATTACK_MISS_THRESHOLD_SECONDS
  ) {
    internalState.asteroidAttackTarget = playerOrbitedAsteroid
    internalState.asteroidAttackPersistSecondsRemaining = ASTEROID_ATTACK_PERSIST_AFTER_ORBIT_SECONDS
  }

  const attackTarget = internalState.asteroidAttackTarget
  if (attackTarget === null) return

  // stop attacking when the rock is destroyed, or the persist window (after the player leaves) runs out
  if (attackTarget.isDestroyed) {
    internalState.asteroidAttackTarget = null
    internalState.secondsShootingWhilePlayerOrbiting = 0
    return
  }
  if (playerOrbitedAsteroid === attackTarget) {
    internalState.asteroidAttackPersistSecondsRemaining = ASTEROID_ATTACK_PERSIST_AFTER_ORBIT_SECONDS
  } else {
    internalState.asteroidAttackPersistSecondsRemaining -= deltaSeconds
    if (internalState.asteroidAttackPersistSecondsRemaining <= 0) {
      internalState.asteroidAttackTarget = null
      internalState.secondsShootingWhilePlayerOrbiting = 0
      return
    }
  }

  // override: aim at the asteroid and fire on it (laser short range, missile in the long envelope)
  scratchVectorToAsteroidTarget.copy(attackTarget.positionMeters).sub(enemyShip.positionMeters)
  const distanceToAsteroidMeters = scratchVectorToAsteroidTarget.length()
  if (distanceToAsteroidMeters > 1e-6) {
    outFireIntent.aimDirectionWorld.copy(scratchVectorToAsteroidTarget).divideScalar(distanceToAsteroidMeters)
  }
  outFireIntent.wantsToFireLaser = distanceToAsteroidMeters <= weaponEngagementRanges.laserShortRangeMeters
  outFireIntent.wantsToFireMissile =
    distanceToAsteroidMeters >= MISSILE_MINIMUM_RANGE_METERS &&
    distanceToAsteroidMeters <= MISSILE_MAXIMUM_RANGE_METERS
}

// ---- D68: additive grapple weave ----

/**
 * If the enemy can grapple (grappleStrength > 0), periodically latch the nearest in-range large
 * asteroid and arc around it (constant-speed kinematic circle via computeOrbitStep), then release
 * keeping the tangential velocity. Returns true on a frame where the arc moved the ship (so the caller
 * skips the normal steer step). Tier aim/fire and facing are unaffected — grapple is purely additive.
 */
function updateEnemyGrappleWeave(
  enemyShip: EnemyShip,
  internalState: EnemyBehaviorInternalState,
  asteroids: readonly AsteroidBody[],
  deltaSeconds: number,
  cruiseSpeedMetersPerSecond: number,
): boolean {
  enemyShip.grappledAsteroid = null // D70: cleared unless we end this frame actively arcing (set below)
  if (internalState.grappleCooldownSecondsRemaining > 0) {
    internalState.grappleCooldownSecondsRemaining -= deltaSeconds
  }
  if (enemyShip.grappleStrength <= 0) {
    internalState.isGrappling = false
    return false
  }

  // already arcing — advance along the fixed circle, or release when done/lost
  if (internalState.isGrappling) {
    const grappleAsteroid = internalState.grappleAsteroid
    internalState.grappleArcSecondsRemaining -= deltaSeconds
    if (!grappleAsteroid || grappleAsteroid.isDestroyed || internalState.grappleArcSecondsRemaining <= 0) {
      internalState.isGrappling = false
      internalState.grappleAsteroid = null
      internalState.grappleCooldownSecondsRemaining =
        GRAPPLE_BASE_COOLDOWN_SECONDS - GRAPPLE_COOLDOWN_SECONDS_PER_STRENGTH * enemyShip.grappleStrength
      return false // released — keep the (tangential) velocity; normal steer resumes next frame
    }
    computeOrbitStep(
      enemyShip.positionMeters,
      grappleAsteroid.positionMeters,
      internalState.grappleOrbitAxisUnit,
      internalState.grappleOrbitRadiusMeters,
      cruiseSpeedMetersPerSecond,
      deltaSeconds,
      scratchGrappleOutPosition,
      scratchGrappleOutVelocity,
    )
    enemyShip.positionMeters.copy(scratchGrappleOutPosition)
    enemyShip.velocityMetersPerSecond.copy(scratchGrappleOutVelocity)
    enemyShip.grappledAsteroid = grappleAsteroid // D70: drive the visible grapple beam/rings
    return true
  }

  // not arcing — try to latch the nearest live large asteroid within range (if off cooldown)
  if (internalState.grappleCooldownSecondsRemaining > 0) return false
  let latchAsteroid: AsteroidBody | null = null
  let nearestDistanceMeters = Infinity
  for (const asteroid of asteroids) {
    if (asteroid.isDestroyed || asteroid.sizeClass !== 'large') continue
    const distanceMeters = asteroid.positionMeters.distanceTo(enemyShip.positionMeters)
    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters
      latchAsteroid = asteroid
    }
  }
  if (!latchAsteroid || nearestDistanceMeters > GRAPPLE_LATCH_MAX_CENTER_DISTANCE_METERS) return false

  // orbit axis = radius × velocity (perpendicular to radius → clean circle); fall back if degenerate
  scratchGrappleRadiusVector.copy(enemyShip.positionMeters).sub(latchAsteroid.positionMeters)
  scratchGrappleAxis.crossVectors(scratchGrappleRadiusVector, enemyShip.velocityMetersPerSecond)
  if (scratchGrappleAxis.lengthSq() < 1e-9) scratchGrappleAxis.crossVectors(scratchGrappleRadiusVector, WORLD_UP_AXIS)
  if (scratchGrappleAxis.lengthSq() < 1e-9) scratchGrappleAxis.crossVectors(scratchGrappleRadiusVector, WORLD_RIGHT_AXIS)
  if (scratchGrappleAxis.lengthSq() < 1e-9) return false

  internalState.grappleOrbitAxisUnit.copy(scratchGrappleAxis).normalize()
  internalState.grappleOrbitRadiusMeters = Math.max(GRAPPLE_MIN_ORBIT_RADIUS_METERS, nearestDistanceMeters)
  internalState.grappleAsteroid = latchAsteroid
  internalState.isGrappling = true
  internalState.grappleArcSecondsRemaining =
    GRAPPLE_BASE_ARC_SECONDS + GRAPPLE_ARC_SECONDS_PER_STRENGTH * enemyShip.grappleStrength

  // advance one step now so the motion is continuous from the latch frame
  computeOrbitStep(
    enemyShip.positionMeters,
    latchAsteroid.positionMeters,
    internalState.grappleOrbitAxisUnit,
    internalState.grappleOrbitRadiusMeters,
    cruiseSpeedMetersPerSecond,
    deltaSeconds,
    scratchGrappleOutPosition,
    scratchGrappleOutVelocity,
  )
  enemyShip.positionMeters.copy(scratchGrappleOutPosition)
  enemyShip.velocityMetersPerSecond.copy(scratchGrappleOutVelocity)
  enemyShip.grappledAsteroid = latchAsteroid // D70: drive the visible grapple beam/rings
  return true
}

// ---- shared movement ----

function steerEnemyTowardGoalPoint(
  enemyShip: EnemyShip,
  goalPointMeters: Vector3,
  cruiseSpeedMetersPerSecond: number,
  deltaSeconds: number,
): void {
  scratchDesiredVelocity.copy(goalPointMeters).sub(enemyShip.positionMeters)
  const distanceToGoalMeters = scratchDesiredVelocity.length()
  if (distanceToGoalMeters > 1e-6) {
    const desiredSpeedMetersPerSecond = Math.min(
      cruiseSpeedMetersPerSecond,
      distanceToGoalMeters * ARRIVAL_BRAKING_GAIN_PER_SECOND,
    )
    scratchDesiredVelocity.multiplyScalar(desiredSpeedMetersPerSecond / distanceToGoalMeters)
  } else {
    scratchDesiredVelocity.set(0, 0, 0)
  }

  scratchSteeringAcceleration
    .copy(scratchDesiredVelocity)
    .sub(enemyShip.velocityMetersPerSecond)
    .multiplyScalar(VELOCITY_CORRECTION_GAIN_PER_SECOND)
  if (scratchSteeringAcceleration.length() > MAX_STEERING_ACCELERATION_METERS_PER_SECOND_SQUARED) {
    scratchSteeringAcceleration.setLength(MAX_STEERING_ACCELERATION_METERS_PER_SECOND_SQUARED)
  }

  enemyShip.velocityMetersPerSecond.addScaledVector(scratchSteeringAcceleration, deltaSeconds)
  enemyShip.positionMeters.addScaledVector(enemyShip.velocityMetersPerSecond, deltaSeconds)
}

function turnEnemyTowardFacingDirection(
  enemyShip: EnemyShip,
  faceDirectionWorld: Vector3,
  deltaSeconds: number,
): void {
  // Matrix4.lookAt(eye=origin, target=direction) yields a rotation whose local -Z points along the direction
  scratchLookAtMatrix.lookAt(WORLD_ORIGIN, faceDirectionWorld, WORLD_UP_AXIS)
  scratchTargetOrientation.setFromRotationMatrix(scratchLookAtMatrix)
  enemyShip.orientation.rotateTowards(scratchTargetOrientation, MAX_TURN_RATE_RADIANS_PER_SECOND * deltaSeconds)
}

// ---- dumbPatrol tier (D8) ----

function updateDumbPatrolTier(
  enemyShip: EnemyShip,
  internalState: EnemyBehaviorInternalState,
  distanceToPlayerMeters: number,
  isPlayerInClearSight: boolean,
  outFireIntent: EnemyFireIntent,
  outGoalPointMeters: Vector3,
): number {
  // STEP A: wander — pick a fresh random waypoint when arriving at the current one
  if (
    !internalState.hasPatrolWaypoint ||
    enemyShip.positionMeters.distanceTo(internalState.patrolWaypointMeters) < PATROL_WAYPOINT_ARRIVAL_RADIUS_METERS
  ) {
    internalState.patrolWaypointMeters
      .randomDirection()
      .multiplyScalar(Math.cbrt(Math.random()) * PATROL_WANDER_SPHERE_RADIUS_METERS)
    internalState.hasPatrolWaypoint = true
  }
  outGoalPointMeters.copy(internalState.patrolWaypointMeters)

  // STEP B: lasers only, and only when the player is short-range, roughly ahead, and unoccluded (R9)
  if (isPlayerInClearSight && distanceToPlayerMeters <= weaponEngagementRanges.laserShortRangeMeters) {
    scratchNoseFacingDirection.copy(ENEMY_LOCAL_FORWARD_AXIS).applyQuaternion(enemyShip.orientation)
    if (scratchNoseFacingDirection.dot(outFireIntent.aimDirectionWorld) >= PATROL_FIRING_CONE_COSINE) {
      outFireIntent.wantsToFireLaser = true
    }
  }

  return PATROL_CRUISE_SPEED_METERS_PER_SECOND
}

// ---- orbitStrafe tier (D8) ----

function updateOrbitStrafeTier(
  enemyShip: EnemyShip,
  playerPositionMeters: Vector3,
  distanceToPlayerMeters: number,
  isPlayerInClearSight: boolean,
  outFireIntent: EnemyFireIntent,
  outGoalPointMeters: Vector3,
): number {
  // STEP A: goal slides around the orbit circle — standoff radius plus a tangential lead
  scratchOrbitRadialDirection.copy(enemyShip.positionMeters).sub(playerPositionMeters)
  if (scratchOrbitRadialDirection.lengthSq() < 1e-9) scratchOrbitRadialDirection.copy(WORLD_RIGHT_AXIS)
  scratchOrbitRadialDirection.normalize()
  scratchOrbitTangentDirection.crossVectors(scratchOrbitRadialDirection, WORLD_UP_AXIS)
  if (scratchOrbitTangentDirection.lengthSq() < 1e-9) {
    scratchOrbitTangentDirection.crossVectors(scratchOrbitRadialDirection, WORLD_RIGHT_AXIS)
  }
  scratchOrbitTangentDirection.normalize()
  outGoalPointMeters
    .copy(playerPositionMeters)
    .addScaledVector(scratchOrbitRadialDirection, ORBIT_STANDOFF_RADIUS_METERS)
    .addScaledVector(scratchOrbitTangentDirection, ORBIT_TANGENTIAL_LEAD_METERS)

  // STEP B: lasers in short range, missiles inside the long-range envelope, both need clear LOS (R9, D11)
  if (isPlayerInClearSight) {
    if (distanceToPlayerMeters <= weaponEngagementRanges.laserShortRangeMeters) {
      outFireIntent.wantsToFireLaser = true
    }
    if (
      distanceToPlayerMeters >= MISSILE_MINIMUM_RANGE_METERS &&
      distanceToPlayerMeters <= MISSILE_MAXIMUM_RANGE_METERS
    ) {
      outFireIntent.wantsToFireMissile = true
    }
  }

  return ORBIT_CRUISE_SPEED_METERS_PER_SECOND
}

// ---- coverHunter tier (D8, D11) ----

function pickNewCoverAsteroid(
  internalState: EnemyBehaviorInternalState,
  enemyShip: EnemyShip,
  asteroids: readonly AsteroidBody[],
  playerPositionMeters: Vector3,
): void {
  // D67 "approach": among alive LARGE asteroids within one advance STEP of the enemy (R6: only large
  // rocks make viable cover), prefer the one CLOSEST TO THE PLAYER, so the hunter ladders inward over
  // successive picks. If none are within a step, fall back to the nearest large asteroid (no advance).
  let advanceCoverAsteroid: AsteroidBody | null = null
  let advanceBestDistanceToPlayerSquared = Infinity
  let nearestLargeAsteroid: AsteroidBody | null = null
  let nearestDistanceToEnemySquared = Infinity
  const advanceStepSquared = COVER_ADVANCE_MAX_STEP_METERS * COVER_ADVANCE_MAX_STEP_METERS
  for (const asteroid of asteroids) {
    if (asteroid.isDestroyed || asteroid.sizeClass !== 'large') continue
    const distanceToEnemySquared = asteroid.positionMeters.distanceToSquared(enemyShip.positionMeters)
    if (distanceToEnemySquared < nearestDistanceToEnemySquared) {
      nearestDistanceToEnemySquared = distanceToEnemySquared
      nearestLargeAsteroid = asteroid
    }
    if (distanceToEnemySquared <= advanceStepSquared) {
      const distanceToPlayerSquared = asteroid.positionMeters.distanceToSquared(playerPositionMeters)
      if (distanceToPlayerSquared < advanceBestDistanceToPlayerSquared) {
        advanceBestDistanceToPlayerSquared = distanceToPlayerSquared
        advanceCoverAsteroid = asteroid
      }
    }
  }

  const chosenCoverAsteroid = advanceCoverAsteroid ?? nearestLargeAsteroid
  internalState.coverAsteroid = chosenCoverAsteroid
  internalState.secondsUntilCoverAdvance = COVER_ADVANCE_RECONSIDER_SECONDS
  internalState.isPeeking = false
  internalState.secondsUntilNextPeek =
    COVER_PEEK_INTERVAL_MIN_SECONDS +
    Math.random() * (COVER_PEEK_INTERVAL_MAX_SECONDS - COVER_PEEK_INTERVAL_MIN_SECONDS)
  if (chosenCoverAsteroid) {
    internalState.coverAsteroidRadiusWhenChosenMeters = chosenCoverAsteroid.currentRadiusMeters
    computeCoverHidePointBehindAsteroid(chosenCoverAsteroid, playerPositionMeters, internalState.hidePointMeters)
  }
}

function startCoverPeek(internalState: EnemyBehaviorInternalState, playerPositionMeters: Vector3): void {
  const coverAsteroid = internalState.coverAsteroid
  if (!coverAsteroid) return
  internalState.isPeeking = true
  internalState.peekSecondsRemaining = COVER_PEEK_DURATION_SECONDS

  // peek goal: hide point shifted sideways past the asteroid rim, random side each peek
  scratchPeekSideDirection.copy(coverAsteroid.positionMeters).sub(playerPositionMeters).cross(WORLD_UP_AXIS)
  if (scratchPeekSideDirection.lengthSq() < 1e-9) {
    scratchPeekSideDirection.copy(coverAsteroid.positionMeters).sub(playerPositionMeters).cross(WORLD_RIGHT_AXIS)
  }
  if (scratchPeekSideDirection.lengthSq() < 1e-9) scratchPeekSideDirection.copy(WORLD_RIGHT_AXIS)
  const peekSideSign = Math.random() < 0.5 ? -1 : 1
  internalState.peekGoalPointMeters
    .copy(internalState.hidePointMeters)
    .addScaledVector(
      scratchPeekSideDirection.normalize(),
      peekSideSign * (coverAsteroid.currentRadiusMeters + COVER_PEEK_RIM_CLEARANCE_METERS),
    )
}

function updateCoverHunterTier(
  enemyShip: EnemyShip,
  internalState: EnemyBehaviorInternalState,
  asteroids: readonly AsteroidBody[],
  playerPositionMeters: Vector3,
  distanceToPlayerMeters: number,
  isPlayerInClearSight: boolean,
  deltaSeconds: number,
  outFireIntent: EnemyFireIntent,
  outGoalPointMeters: Vector3,
): number {
  // STEP A: re-pick cover when it is destroyed, chipped below 60% of its chosen radius (D11),
  // or the player has gained line of sight to the stored hide point
  const currentCover = internalState.coverAsteroid
  const isCoverLost =
    !currentCover ||
    currentCover.isDestroyed ||
    currentCover.currentRadiusMeters <
      COVER_REPICK_SHRINK_FRACTION * internalState.coverAsteroidRadiusWhenChosenMeters ||
    !isLineOfSightBlockedByAsteroids(playerPositionMeters, internalState.hidePointMeters, asteroids)
  // D67: even when current cover is still valid, periodically re-pick to ADVANCE toward the player
  // (pickNewCoverAsteroid biases toward player-closer rocks within a step) — but don't relocate mid-peek
  internalState.secondsUntilCoverAdvance -= deltaSeconds
  const shouldAdvanceCover = !internalState.isPeeking && internalState.secondsUntilCoverAdvance <= 0
  if (isCoverLost || shouldAdvanceCover) {
    pickNewCoverAsteroid(internalState, enemyShip, asteroids, playerPositionMeters)
  }

  // no large asteroid left to hide behind → fall back to patrol wandering
  if (!internalState.coverAsteroid) {
    return updateDumbPatrolTier(
      enemyShip, internalState, distanceToPlayerMeters, isPlayerInClearSight, outFireIntent, outGoalPointMeters,
    )
  }

  // STEP B: peek cycle — loiter hidden for 5–8 s, then slide past the rim for ~2 s
  if (internalState.isPeeking) {
    internalState.peekSecondsRemaining -= deltaSeconds
    if (internalState.peekSecondsRemaining <= 0) {
      internalState.isPeeking = false
      internalState.secondsUntilNextPeek =
        COVER_PEEK_INTERVAL_MIN_SECONDS +
        Math.random() * (COVER_PEEK_INTERVAL_MAX_SECONDS - COVER_PEEK_INTERVAL_MIN_SECONDS)
    }
  } else {
    internalState.secondsUntilNextPeek -= deltaSeconds
    if (internalState.secondsUntilNextPeek <= 0) startCoverPeek(internalState, playerPositionMeters)
  }
  outGoalPointMeters.copy(internalState.isPeeking ? internalState.peekGoalPointMeters : internalState.hidePointMeters)

  // STEP C: attack whenever the player is exposed (in practice: during peeks) — lasers short
  // range, missiles in the long-range envelope (R9)
  if (isPlayerInClearSight) {
    if (distanceToPlayerMeters <= weaponEngagementRanges.laserShortRangeMeters) {
      outFireIntent.wantsToFireLaser = true
    } else if (
      distanceToPlayerMeters >= MISSILE_MINIMUM_RANGE_METERS &&
      distanceToPlayerMeters <= MISSILE_MAXIMUM_RANGE_METERS
    ) {
      outFireIntent.wantsToFireMissile = true
    }
  }

  return COVER_CRUISE_SPEED_METERS_PER_SECOND
}
