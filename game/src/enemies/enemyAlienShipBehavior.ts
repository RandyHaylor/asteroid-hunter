import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Scene } from 'three'
import type { AsteroidBody, EnemyShip, EnemyShipBehaviorTier } from '../gameSimulation/gameWorldTypes'
import { weaponEngagementRanges } from '../gameSimulation/gameWorldTypes'
import { isLineOfSightBlockedByAsteroids } from '../gameSimulation/lineOfSightProbe'
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
const PATROL_CRUISE_SPEED_METERS_PER_SECOND = 30
/** only fires when the player is roughly ahead: within ~25° of the nose */
const PATROL_FIRING_CONE_COSINE = Math.cos((25 * Math.PI) / 180)

// ---- orbitStrafe tuning (D8) ----
const ORBIT_STANDOFF_RADIUS_METERS = 380 // D46: orbit/strafe farther out (longer passes away)
const ORBIT_CRUISE_SPEED_METERS_PER_SECOND = 50
/** tangential lead distance that keeps the goal point sliding around the orbit circle */
const ORBIT_TANGENTIAL_LEAD_METERS = 120

// ---- missile envelope (R9: travel time makes point-blank missiles useless) ----
const MISSILE_MINIMUM_RANGE_METERS = 250
const MISSILE_MAXIMUM_RANGE_METERS = 900

// ---- coverHunter tuning (D8, D11) ----
const COVER_HIDE_STANDOFF_METERS = 12
const COVER_CRUISE_SPEED_METERS_PER_SECOND = 50
const COVER_PEEK_INTERVAL_MIN_SECONDS = 5
const COVER_PEEK_INTERVAL_MAX_SECONDS = 8
const COVER_PEEK_DURATION_SECONDS = 2
/** lateral clearance past the asteroid rim when peeking out */
const COVER_PEEK_RIM_CLEARANCE_METERS = 20
/** D11: chipped cover shrinking below this fraction of its chosen radius forces relocation */
const COVER_REPICK_SHRINK_FRACTION = 0.6

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
  const enemyShipMesh = createEnemyShipMesh()
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
const scratchNoseFacingDirection = new Vector3()
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

  // STEP 4: steer by target velocity toward the goal, thrust-limited like the player physics (R3/D12)
  steerEnemyTowardGoalPoint(enemyShip, scratchGoalPoint, cruiseSpeedMetersPerSecond, deltaSeconds)

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
  // nearest alive LARGE asteroid (R6: only large asteroids make viable cover)
  let nearestLargeAsteroid: AsteroidBody | null = null
  let nearestDistanceSquared = Infinity
  for (const asteroid of asteroids) {
    if (asteroid.isDestroyed || asteroid.sizeClass !== 'large') continue
    const distanceSquared = asteroid.positionMeters.distanceToSquared(enemyShip.positionMeters)
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared
      nearestLargeAsteroid = asteroid
    }
  }

  internalState.coverAsteroid = nearestLargeAsteroid
  internalState.isPeeking = false
  internalState.secondsUntilNextPeek =
    COVER_PEEK_INTERVAL_MIN_SECONDS +
    Math.random() * (COVER_PEEK_INTERVAL_MAX_SECONDS - COVER_PEEK_INTERVAL_MIN_SECONDS)
  if (nearestLargeAsteroid) {
    internalState.coverAsteroidRadiusWhenChosenMeters = nearestLargeAsteroid.currentRadiusMeters
    computeCoverHidePointBehindAsteroid(nearestLargeAsteroid, playerPositionMeters, internalState.hidePointMeters)
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
  if (isCoverLost) {
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
