import * as THREE from 'three'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import type { LaserWeaponStats } from './weaponStats'

// R9: lasers are short range — bolts fly straight and despawn past maxRangeMeters.
// D11: both the player and enemies fire through this system, and enemy bolts chip asteroids too.
// Cooldown gating is intentionally the CALLER's job (the caller knows nowSeconds and the
// shooter's stats); tryFireLaserVolley always fires when invoked.

export type LaserHitCallbacks = {
  onEnemyHitByPlayer(enemy: EnemyShip, damage: number): void
  onAsteroidHit(asteroid: AsteroidBody, impactPointMeters: THREE.Vector3, damage: number): void
  onPlayerHit(damage: number): void
}

export type LaserVolleySystem = {
  tryFireLaserVolley(
    originPositionMeters: THREE.Vector3,
    aimDirection: THREE.Vector3,
    laserStats: LaserWeaponStats,
    firedByPlayer: boolean,
    nowSeconds: number,
  ): boolean
  updateLaserBolts(
    deltaSeconds: number,
    asteroids: readonly AsteroidBody[],
    enemyShips: readonly EnemyShip[],
    playerPositionMeters: THREE.Vector3,
    hitCallbacks: LaserHitCallbacks,
  ): void
}

type ActiveLaserBolt = {
  boltMesh: THREE.Mesh
  velocityMetersPerSecond: THREE.Vector3
  distanceTraveledMeters: number
  maxRangeMeters: number
  boltDamage: number
  firedByPlayer: boolean
  firedAtSeconds: number
}

const ENEMY_SHIP_HIT_RADIUS_METERS = 12 // D56: 3× to match the enlarged enemy model
const PLAYER_SHIP_HIT_RADIUS_METERS = 3

// bolt visual: small elongated emissive box, long axis along the flight direction
const BOLT_LENGTH_METERS = 3
const BOLT_THICKNESS_METERS = 0.25

const sharedBoltGeometry = new THREE.BoxGeometry(BOLT_THICKNESS_METERS, BOLT_THICKNESS_METERS, BOLT_LENGTH_METERS)
const sharedPlayerBoltMaterial = new THREE.MeshBasicMaterial({ color: 0x66ffee })
const sharedEnemyBoltMaterial = new THREE.MeshBasicMaterial({ color: 0xff5544 })

const BOLT_MESH_LOCAL_FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

// scratch objects reused every fire/update call to avoid per-frame allocations
const scratchFanRotationAxis = new THREE.Vector3()
const scratchFannedAimDirection = new THREE.Vector3()
const scratchFanRotation = new THREE.Quaternion()
const scratchWorldUpAxis = new THREE.Vector3(0, 1, 0)
const scratchWorldRightAxis = new THREE.Vector3(1, 0, 0)

export function createLaserVolleySystem(gameScene: THREE.Scene): LaserVolleySystem {
  const activeLaserBolts: ActiveLaserBolt[] = []

  function despawnLaserBoltAtIndex(boltIndex: number): void {
    const despawnedBolt = activeLaserBolts[boltIndex]
    gameScene.remove(despawnedBolt.boltMesh)
    // swap-remove: order of in-flight bolts does not matter
    activeLaserBolts[boltIndex] = activeLaserBolts[activeLaserBolts.length - 1]
    activeLaserBolts.pop()
  }

  return {
    tryFireLaserVolley(originPositionMeters, aimDirection, laserStats, firedByPlayer, nowSeconds): boolean {
      // STEP 1: pick a fan axis perpendicular to the aim so multi-bolt volleys spread sideways (R18)
      scratchFanRotationAxis.crossVectors(aimDirection, scratchWorldUpAxis)
      if (scratchFanRotationAxis.lengthSq() < 1e-6) {
        scratchFanRotationAxis.crossVectors(aimDirection, scratchWorldRightAxis)
      }
      scratchFanRotationAxis.normalize()

      // STEP 2: spawn simultaneousBoltCount bolts fanned evenly across spreadAngleRadians
      const boltCount = Math.max(1, laserStats.simultaneousBoltCount)
      for (let boltIndex = 0; boltIndex < boltCount; boltIndex++) {
        const fanFraction = boltCount === 1 ? 0 : boltIndex / (boltCount - 1) - 0.5
        scratchFanRotation.setFromAxisAngle(scratchFanRotationAxis, fanFraction * laserStats.spreadAngleRadians)
        scratchFannedAimDirection.copy(aimDirection).normalize().applyQuaternion(scratchFanRotation)

        const boltMesh = new THREE.Mesh(
          sharedBoltGeometry,
          firedByPlayer ? sharedPlayerBoltMaterial : sharedEnemyBoltMaterial,
        )
        boltMesh.position.copy(originPositionMeters)
        boltMesh.quaternion.setFromUnitVectors(BOLT_MESH_LOCAL_FORWARD_AXIS, scratchFannedAimDirection)
        gameScene.add(boltMesh)

        activeLaserBolts.push({
          boltMesh,
          velocityMetersPerSecond: scratchFannedAimDirection
            .clone()
            .multiplyScalar(laserStats.boltSpeedMetersPerSecond),
          distanceTraveledMeters: 0,
          maxRangeMeters: laserStats.maxRangeMeters,
          boltDamage: laserStats.boltDamage,
          firedByPlayer,
          firedAtSeconds: nowSeconds,
        })
      }
      return true
    },

    updateLaserBolts(deltaSeconds, asteroids, enemyShips, playerPositionMeters, hitCallbacks): void {
      // iterate backwards so swap-remove despawns never skip a bolt
      for (let boltIndex = activeLaserBolts.length - 1; boltIndex >= 0; boltIndex--) {
        const laserBolt = activeLaserBolts[boltIndex]

        // STEP 1: advance the bolt along its straight flight path
        laserBolt.boltMesh.position.addScaledVector(laserBolt.velocityMetersPerSecond, deltaSeconds)
        laserBolt.distanceTraveledMeters += laserBolt.velocityMetersPerSecond.length() * deltaSeconds

        // STEP 2: R9 short range — despawn bolts past their max range
        if (laserBolt.distanceTraveledMeters > laserBolt.maxRangeMeters) {
          despawnLaserBoltAtIndex(boltIndex)
          continue
        }

        const boltPositionMeters = laserBolt.boltMesh.position
        let boltConsumedByHit = false

        // STEP 3: sphere collision vs asteroids — BOTH sides chip asteroids (D11)
        for (const asteroid of asteroids) {
          if (asteroid.isDestroyed) continue
          if (boltPositionMeters.distanceToSquared(asteroid.positionMeters) >
              asteroid.currentRadiusMeters * asteroid.currentRadiusMeters) continue
          hitCallbacks.onAsteroidHit(asteroid, boltPositionMeters, laserBolt.boltDamage)
          boltConsumedByHit = true
          break
        }

        // STEP 4: ship collisions — player bolts hit enemies, enemy bolts hit the player
        if (!boltConsumedByHit && laserBolt.firedByPlayer) {
          for (const enemyShip of enemyShips) {
            if (enemyShip.isDestroyed) continue
            if (boltPositionMeters.distanceToSquared(enemyShip.positionMeters) >
                ENEMY_SHIP_HIT_RADIUS_METERS * ENEMY_SHIP_HIT_RADIUS_METERS) continue
            hitCallbacks.onEnemyHitByPlayer(enemyShip, laserBolt.boltDamage)
            boltConsumedByHit = true
            break
          }
        } else if (!boltConsumedByHit && !laserBolt.firedByPlayer) {
          if (boltPositionMeters.distanceToSquared(playerPositionMeters) <=
              PLAYER_SHIP_HIT_RADIUS_METERS * PLAYER_SHIP_HIT_RADIUS_METERS) {
            hitCallbacks.onPlayerHit(laserBolt.boltDamage)
            boltConsumedByHit = true
          }
        }

        if (boltConsumedByHit) despawnLaserBoltAtIndex(boltIndex)
      }
    },
  }
}
