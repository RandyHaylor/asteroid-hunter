import * as THREE from 'three'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'
import { autoAimConfig } from './noseConeAutoAim'

// D29: a green ring that visualizes the auto-aim cone (D6). It is the circle where the aim cone
// intersects the plane (perpendicular to the nose) that passes through the CLOSEST enemy — so the
// ring sits at that enemy's depth and its radius is exactly the cone's cross-section there. Line an
// enemy up inside the ring and it's within the lock cone. Hidden when no enemy is ahead.

const RING_COLOR_GREEN = 0x44ff88

const scratchPlayerToEnemy = new THREE.Vector3()
const ringAxisDefaultDirection = new THREE.Vector3(0, 0, 1) // RingGeometry's normal before orienting

export type TargetingConeRing = {
  /**
   * Position the ring at the closest enemy's depth along the nose. Pass null (no enemy, or the
   * closest enemy is behind the nose) to hide it.
   */
  updateTargetingConeRing(
    closestEnemyAhead: EnemyShip | null,
    playerPositionMeters: THREE.Vector3,
    playerForwardDirection: THREE.Vector3,
  ): void
}

export function createTargetingConeRing(gameScene: THREE.Scene): TargetingConeRing {
  // a thin unit-radius annulus (outline ring); we rescale it each frame to the cone cross-section
  // radius. A thin inner/outer ratio keeps the outline proportionally slim at any depth.
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1.0, 48),
    new THREE.MeshBasicMaterial({
      color: RING_COLOR_GREEN,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  ringMesh.visible = false
  gameScene.add(ringMesh)

  const coneHalfAngleTangent = Math.tan(autoAimConfig.coneHalfAngleRadians)

  return {
    updateTargetingConeRing(closestEnemyAhead, playerPositionMeters, playerForwardDirection): void {
      if (closestEnemyAhead === null) {
        ringMesh.visible = false
        return
      }

      // depth of the enemy measured ALONG the nose axis (projection); behind the nose → hide
      scratchPlayerToEnemy.copy(closestEnemyAhead.positionMeters).sub(playerPositionMeters)
      const depthAlongNoseMeters = scratchPlayerToEnemy.dot(playerForwardDirection)
      if (depthAlongNoseMeters <= 1) {
        ringMesh.visible = false
        return
      }

      // cone cross-section radius at that depth = depth * tan(coneHalfAngle)
      const coneRadiusAtDepthMeters = depthAlongNoseMeters * coneHalfAngleTangent

      // center the ring on the nose axis at the enemy's depth, facing down the nose
      ringMesh.position
        .copy(playerPositionMeters)
        .addScaledVector(playerForwardDirection, depthAlongNoseMeters)
      ringMesh.scale.set(coneRadiusAtDepthMeters, coneRadiusAtDepthMeters, 1)
      ringMesh.quaternion.setFromUnitVectors(ringAxisDefaultDirection, playerForwardDirection)
      ringMesh.visible = true
    },
  }
}
