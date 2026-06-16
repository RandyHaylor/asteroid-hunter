import * as THREE from 'three'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import type { MissileWeaponStats } from './weaponStats'

// R9: missiles are long range — slow projectiles where travel time matters; there is no hard
// distance cap, only a generous lifetime despawn. They detonate on first contact and splash
// explosionDamage to EVERYTHING within explosionRadiusMeters (asteroids included, D11/R12).
// Cooldown gating is intentionally the CALLER's job; tryFireMissile always fires when invoked.

export type MissileHitCallbacks = {
  onEnemyHitByPlayer(enemy: EnemyShip, damage: number): void
  onAsteroidHit(asteroid: AsteroidBody, impactPointMeters: THREE.Vector3, damage: number): void
  onPlayerHit(damage: number): void
}

/** a live entity reference the missile steers toward — EnemyShip fits; wrap the player as needed */
export type HomingTargetReference = {
  positionMeters: THREE.Vector3
  isDestroyed?: boolean
}

export type MissileVolleySystem = {
  tryFireMissile(
    originPositionMeters: THREE.Vector3,
    aimDirection: THREE.Vector3,
    missileStats: MissileWeaponStats,
    firedByPlayer: boolean,
    nowSeconds: number,
    homingTarget?: HomingTargetReference | null,
  ): boolean
  updateMissiles(
    deltaSeconds: number,
    asteroids: readonly AsteroidBody[],
    enemyShips: readonly EnemyShip[],
    playerPositionMeters: THREE.Vector3,
    hitCallbacks: MissileHitCallbacks,
  ): void
}

type ActiveMissile = {
  missileMesh: THREE.Group
  velocityMetersPerSecond: THREE.Vector3
  ageSeconds: number
  explosionRadiusMeters: number
  explosionDamage: number
  firedByPlayer: boolean
  firedAtSeconds: number
  /** R18: weak homing toward the lock at launch — turn rate is a weapon stat, captured at fire time */
  homingTarget: HomingTargetReference | null
  homingTurnRateRadiansPerSecond: number
}

type ActiveExplosionFireball = {
  fireballMesh: THREE.Mesh
  fireballMaterial: THREE.MeshBasicMaterial
  ageSeconds: number
  maxRadiusMeters: number
}

const ENEMY_SHIP_HIT_RADIUS_METERS = 12 // D56: 3× to match the enlarged enemy model
const PLAYER_SHIP_HIT_RADIUS_METERS = 3
/** R9: no hard range cap, but stray missiles eventually clean themselves up */
const MISSILE_LIFETIME_SECONDS = 25
const FIREBALL_EXPANSION_DURATION_SECONDS = 0.45

// missile visual: cone-nosed body with an emissive exhaust glow at the tail
const MISSILE_BODY_LENGTH_METERS = 1.6
const MISSILE_BODY_RADIUS_METERS = 0.3
const MISSILE_NOSE_LENGTH_METERS = 0.7

const sharedMissileBodyGeometry = new THREE.CylinderGeometry(
  MISSILE_BODY_RADIUS_METERS,
  MISSILE_BODY_RADIUS_METERS,
  MISSILE_BODY_LENGTH_METERS,
  8,
)
const sharedMissileNoseGeometry = new THREE.ConeGeometry(MISSILE_BODY_RADIUS_METERS, MISSILE_NOSE_LENGTH_METERS, 8)
const sharedExhaustGlowGeometry = new THREE.SphereGeometry(0.45, 8, 6)
const sharedFireballGeometry = new THREE.SphereGeometry(1, 16, 12)

const sharedPlayerMissileBodyMaterial = new THREE.MeshBasicMaterial({ color: 0xbbddee })
const sharedEnemyMissileBodyMaterial = new THREE.MeshBasicMaterial({ color: 0xddaa99 })
const sharedExhaustGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0xffaa33,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

const MISSILE_MESH_LOCAL_FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

// scratch objects reused every fire/update call to avoid per-frame allocations
const scratchNormalizedAimDirection = new THREE.Vector3()
const scratchCurrentFlightDirection = new THREE.Vector3()
const scratchDesiredHomingDirection = new THREE.Vector3()
const scratchHomingRotationAxis = new THREE.Vector3()
const scratchHomingRotation = new THREE.Quaternion()

/** rotate the missile's velocity toward its homing target by at most turnRate·dt, keeping speed */
function steerMissileTowardHomingTarget(missile: ActiveMissile, deltaSeconds: number): void {
  const homingTarget = missile.homingTarget
  if (!homingTarget || homingTarget.isDestroyed) return

  const flightSpeed = missile.velocityMetersPerSecond.length()
  if (flightSpeed < 1e-6) return
  scratchCurrentFlightDirection.copy(missile.velocityMetersPerSecond).divideScalar(flightSpeed)
  scratchDesiredHomingDirection.copy(homingTarget.positionMeters).sub(missile.missileMesh.position)
  if (scratchDesiredHomingDirection.lengthSq() < 1e-6) return
  scratchDesiredHomingDirection.normalize()

  const angleToTargetRadians = scratchCurrentFlightDirection.angleTo(scratchDesiredHomingDirection)
  if (angleToTargetRadians < 1e-4) return

  scratchHomingRotationAxis.crossVectors(scratchCurrentFlightDirection, scratchDesiredHomingDirection)
  if (scratchHomingRotationAxis.lengthSq() < 1e-10) return // dead astern — no defined turn plane
  scratchHomingRotationAxis.normalize()

  const turnStepRadians = Math.min(
    angleToTargetRadians,
    missile.homingTurnRateRadiansPerSecond * deltaSeconds,
  )
  scratchHomingRotation.setFromAxisAngle(scratchHomingRotationAxis, turnStepRadians)
  missile.velocityMetersPerSecond.applyQuaternion(scratchHomingRotation)
  missile.missileMesh.quaternion.setFromUnitVectors(
    MISSILE_MESH_LOCAL_FORWARD_AXIS,
    scratchCurrentFlightDirection.copy(missile.velocityMetersPerSecond).divideScalar(flightSpeed),
  )
}

function buildMissileMesh(firedByPlayer: boolean): THREE.Group {
  const missileMesh = new THREE.Group()
  const bodyMaterial = firedByPlayer ? sharedPlayerMissileBodyMaterial : sharedEnemyMissileBodyMaterial

  // cylinder/cone geometries point along +Y; rotate them to the group's +Z flight axis
  const bodyMesh = new THREE.Mesh(sharedMissileBodyGeometry, bodyMaterial)
  bodyMesh.rotation.x = Math.PI / 2
  missileMesh.add(bodyMesh)

  const noseMesh = new THREE.Mesh(sharedMissileNoseGeometry, bodyMaterial)
  noseMesh.rotation.x = Math.PI / 2
  noseMesh.position.z = (MISSILE_BODY_LENGTH_METERS + MISSILE_NOSE_LENGTH_METERS) / 2
  missileMesh.add(noseMesh)

  const exhaustGlowMesh = new THREE.Mesh(sharedExhaustGlowGeometry, sharedExhaustGlowMaterial)
  exhaustGlowMesh.position.z = -MISSILE_BODY_LENGTH_METERS / 2
  missileMesh.add(exhaustGlowMesh)

  return missileMesh
}

export function createMissileVolleySystem(gameScene: THREE.Scene): MissileVolleySystem {
  const activeMissiles: ActiveMissile[] = []
  const activeExplosionFireballs: ActiveExplosionFireball[] = []

  function despawnMissileAtIndex(missileIndex: number): void {
    const despawnedMissile = activeMissiles[missileIndex]
    gameScene.remove(despawnedMissile.missileMesh)
    // swap-remove: order of in-flight missiles does not matter
    activeMissiles[missileIndex] = activeMissiles[activeMissiles.length - 1]
    activeMissiles.pop()
  }

  function spawnExplosionFireball(detonationPointMeters: THREE.Vector3, explosionRadiusMeters: number): void {
    // per-instance material because each fireball animates its own opacity fade
    const fireballMaterial = new THREE.MeshBasicMaterial({
      color: 0xff7733,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const fireballMesh = new THREE.Mesh(sharedFireballGeometry, fireballMaterial)
    fireballMesh.position.copy(detonationPointMeters)
    fireballMesh.scale.setScalar(0.01)
    gameScene.add(fireballMesh)
    activeExplosionFireballs.push({ fireballMesh, fireballMaterial, ageSeconds: 0, maxRadiusMeters: explosionRadiusMeters })
  }

  function detonateMissile(
    missile: ActiveMissile,
    asteroids: readonly AsteroidBody[],
    enemyShips: readonly EnemyShip[],
    playerPositionMeters: THREE.Vector3,
    hitCallbacks: MissileHitCallbacks,
  ): void {
    const detonationPointMeters = missile.missileMesh.position
    const explosionRadiusSquared = missile.explosionRadiusMeters * missile.explosionRadiusMeters

    // STEP A: splash damages every asteroid in the blast — cover degrades (D11, R12)
    for (const asteroid of asteroids) {
      if (asteroid.isDestroyed) continue
      const surfaceDistanceSquared = detonationPointMeters.distanceToSquared(asteroid.positionMeters)
      const reachSquared =
        (missile.explosionRadiusMeters + asteroid.currentRadiusMeters) *
        (missile.explosionRadiusMeters + asteroid.currentRadiusMeters)
      if (surfaceDistanceSquared > reachSquared) continue
      hitCallbacks.onAsteroidHit(asteroid, detonationPointMeters, missile.explosionDamage)
    }

    // STEP B: splash damages enemy ships (reported through the player-hit callback only for
    // player-fired missiles — there is no friendly-fire channel for enemy ordnance in v1)
    if (missile.firedByPlayer) {
      for (const enemyShip of enemyShips) {
        if (enemyShip.isDestroyed) continue
        if (detonationPointMeters.distanceToSquared(enemyShip.positionMeters) > explosionRadiusSquared) continue
        hitCallbacks.onEnemyHitByPlayer(enemyShip, missile.explosionDamage)
      }
    }

    // STEP C: splash damages the player — including from their own missile fired too close
    if (detonationPointMeters.distanceToSquared(playerPositionMeters) <= explosionRadiusSquared) {
      hitCallbacks.onPlayerHit(missile.explosionDamage)
    }

    // STEP D: brief expanding transparent fireball, animated and removed by updateMissiles
    spawnExplosionFireball(detonationPointMeters, missile.explosionRadiusMeters)
  }

  function missileTouchesFirstContact(
    missile: ActiveMissile,
    asteroids: readonly AsteroidBody[],
    enemyShips: readonly EnemyShip[],
    playerPositionMeters: THREE.Vector3,
  ): boolean {
    const missilePositionMeters = missile.missileMesh.position

    // asteroids block ordnance from both sides
    for (const asteroid of asteroids) {
      if (asteroid.isDestroyed) continue
      if (missilePositionMeters.distanceToSquared(asteroid.positionMeters) <=
          asteroid.currentRadiusMeters * asteroid.currentRadiusMeters) return true
    }

    // contact arming mirrors laser ownership so a missile never detonates on its own shooter
    if (missile.firedByPlayer) {
      for (const enemyShip of enemyShips) {
        if (enemyShip.isDestroyed) continue
        if (missilePositionMeters.distanceToSquared(enemyShip.positionMeters) <=
            ENEMY_SHIP_HIT_RADIUS_METERS * ENEMY_SHIP_HIT_RADIUS_METERS) return true
      }
      return false
    }
    return (
      missilePositionMeters.distanceToSquared(playerPositionMeters) <=
      PLAYER_SHIP_HIT_RADIUS_METERS * PLAYER_SHIP_HIT_RADIUS_METERS
    )
  }

  return {
    tryFireMissile(originPositionMeters, aimDirection, missileStats, firedByPlayer, nowSeconds, homingTarget = null): boolean {
      scratchNormalizedAimDirection.copy(aimDirection).normalize()

      const missileMesh = buildMissileMesh(firedByPlayer)
      missileMesh.position.copy(originPositionMeters)
      missileMesh.quaternion.setFromUnitVectors(MISSILE_MESH_LOCAL_FORWARD_AXIS, scratchNormalizedAimDirection)
      gameScene.add(missileMesh)

      activeMissiles.push({
        missileMesh,
        velocityMetersPerSecond: scratchNormalizedAimDirection
          .clone()
          .multiplyScalar(missileStats.missileSpeedMetersPerSecond),
        ageSeconds: 0,
        explosionRadiusMeters: missileStats.explosionRadiusMeters,
        explosionDamage: missileStats.explosionDamage,
        firedByPlayer,
        firedAtSeconds: nowSeconds,
        homingTarget,
        homingTurnRateRadiansPerSecond: missileStats.homingTurnRateRadiansPerSecond,
      })
      return true
    },

    updateMissiles(deltaSeconds, asteroids, enemyShips, playerPositionMeters, hitCallbacks): void {
      // ===== STEP 1: advance missiles, detonating on first contact (iterate backwards for swap-remove) =====
      for (let missileIndex = activeMissiles.length - 1; missileIndex >= 0; missileIndex--) {
        const missile = activeMissiles[missileIndex]
        steerMissileTowardHomingTarget(missile, deltaSeconds)
        missile.missileMesh.position.addScaledVector(missile.velocityMetersPerSecond, deltaSeconds)
        missile.ageSeconds += deltaSeconds

        if (missile.ageSeconds > MISSILE_LIFETIME_SECONDS) {
          despawnMissileAtIndex(missileIndex)
          continue
        }

        if (missileTouchesFirstContact(missile, asteroids, enemyShips, playerPositionMeters)) {
          detonateMissile(missile, asteroids, enemyShips, playerPositionMeters, hitCallbacks)
          despawnMissileAtIndex(missileIndex)
        }
      }

      // ===== STEP 2: animate explosion fireballs — expand to blast radius while fading out =====
      for (let fireballIndex = activeExplosionFireballs.length - 1; fireballIndex >= 0; fireballIndex--) {
        const fireball = activeExplosionFireballs[fireballIndex]
        fireball.ageSeconds += deltaSeconds
        const expansionProgress = Math.min(1, fireball.ageSeconds / FIREBALL_EXPANSION_DURATION_SECONDS)
        fireball.fireballMesh.scale.setScalar(Math.max(0.01, expansionProgress * fireball.maxRadiusMeters))
        fireball.fireballMaterial.opacity = 0.8 * (1 - expansionProgress)

        if (expansionProgress >= 1) {
          gameScene.remove(fireball.fireballMesh)
          fireball.fireballMaterial.dispose()
          activeExplosionFireballs[fireballIndex] = activeExplosionFireballs[activeExplosionFireballs.length - 1]
          activeExplosionFireballs.pop()
        }
      }
    },
  }
}
