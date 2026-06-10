import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createMissileVolleySystem, type MissileHitCallbacks } from './missileFire'
import type { MissileWeaponStats } from './weaponStats'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'

const FIXED_TIMESTEP_SECONDS = 1 / 60

const testMissileStats: MissileWeaponStats = {
  fireCooldownSeconds: 1.4,
  missileSpeedMetersPerSecond: 140,
  explosionRadiusMeters: 18,
  explosionDamage: 45,
  homingTurnRateRadiansPerSecond: 0.7,
}

function makeEnemyShipAt(position: THREE.Vector3): EnemyShip {
  return {
    enemyShipId: 1,
    behaviorTier: 'dumbPatrol',
    positionMeters: position.clone(),
    velocityMetersPerSecond: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
    shieldPointsRemaining: 40,
    hitPointsRemaining: 60,
    isDestroyed: false,
    renderObject: new THREE.Object3D(),
  }
}

/** fire one missile straight ahead past an off-axis enemy and report whether it ever hit them */
function simulateMissileShotAtOffAxisEnemy(homingEnabled: boolean): boolean {
  const missileVolleySystem = createMissileVolleySystem(new THREE.Scene())
  // enemy sits ~12 degrees off the firing axis — an unguided missile passes 25 m wide
  const offAxisEnemy = makeEnemyShipAt(new THREE.Vector3(25, 0, 120))
  const farAwayPlayerPosition = new THREE.Vector3(0, 0, -9999)

  let enemyWasHit = false
  const recordingHitCallbacks: MissileHitCallbacks = {
    onEnemyHitByPlayer: () => {
      enemyWasHit = true
    },
    onAsteroidHit: () => {},
    onPlayerHit: () => {},
  }

  missileVolleySystem.tryFireMissile(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 1),
    testMissileStats,
    true,
    0,
    homingEnabled ? offAxisEnemy : null,
  )

  for (let stepIndex = 0; stepIndex < 60 * 5; stepIndex++) {
    missileVolleySystem.updateMissiles(
      FIXED_TIMESTEP_SECONDS,
      [],
      [offAxisEnemy],
      farAwayPlayerPosition,
      recordingHitCallbacks,
    )
    if (enemyWasHit) break
  }
  return enemyWasHit
}

describe('missile homing toward the locked target (R18 stat-driven)', () => {
  it('an unguided missile misses an enemy 12 degrees off the firing axis', () => {
    expect(simulateMissileShotAtOffAxisEnemy(false)).toBe(false)
  })

  it('the same shot with weak homing curves in and hits', () => {
    expect(simulateMissileShotAtOffAxisEnemy(true)).toBe(true)
  })
})
