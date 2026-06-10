import * as THREE from 'three'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'

// D6: auto-aim within a nose cone — the closest live enemy inside the cone becomes
// the target and is visually highlighted with a pulsing ring.

/** D6: cone angle is a mutable config object so upgrades/abilities can expand it later */
export const autoAimConfig = {
  coneHalfAngleRadians: THREE.MathUtils.degToRad(10),
}

// scratch vector reused every frame to avoid per-frame allocations in the hot aim path
const scratchEnemyBearingDirection = new THREE.Vector3()

export function selectAutoAimTargetInNoseCone(
  playerPositionMeters: THREE.Vector3,
  playerForwardDirection: THREE.Vector3,
  enemyShips: readonly EnemyShip[],
): EnemyShip | null {
  // STEP 1: scan every live enemy, keeping the closest one whose bearing fits the cone
  let closestEnemyInCone: EnemyShip | null = null
  let closestEnemyDistanceMeters = Infinity

  for (const enemyShip of enemyShips) {
    if (enemyShip.isDestroyed) continue

    scratchEnemyBearingDirection.copy(enemyShip.positionMeters).sub(playerPositionMeters)
    const enemyDistanceMeters = scratchEnemyBearingDirection.length()
    if (enemyDistanceMeters <= 0 || enemyDistanceMeters >= closestEnemyDistanceMeters) continue

    // STEP 2: bearing off the nose = angle between the forward axis and the enemy direction
    scratchEnemyBearingDirection.divideScalar(enemyDistanceMeters)
    const bearingOffNoseRadians = playerForwardDirection.angleTo(scratchEnemyBearingDirection)
    if (bearingOffNoseRadians > autoAimConfig.coneHalfAngleRadians) continue

    closestEnemyInCone = enemyShip
    closestEnemyDistanceMeters = enemyDistanceMeters
  }

  return closestEnemyInCone
}

// ===== D6: targeted-enemy highlight ring (one reusable instance, hidden when no target) =====

const HIGHLIGHT_RING_INNER_RADIUS_METERS = 5
const HIGHLIGHT_RING_OUTER_RADIUS_METERS = 6.2
const HIGHLIGHT_RING_PULSE_SPEED_RADIANS_PER_SECOND = 6
const HIGHLIGHT_RING_PULSE_SCALE_AMPLITUDE = 0.12

let reusableTargetHighlightRing: THREE.Mesh | null = null

function getOrCreateTargetHighlightRing(gameScene: THREE.Scene): THREE.Mesh {
  if (reusableTargetHighlightRing === null) {
    const ringGeometry = new THREE.RingGeometry(
      HIGHLIGHT_RING_INNER_RADIUS_METERS,
      HIGHLIGHT_RING_OUTER_RADIUS_METERS,
      32,
    )
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4422,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    reusableTargetHighlightRing = new THREE.Mesh(ringGeometry, ringMaterial)
    reusableTargetHighlightRing.visible = false
  }
  if (reusableTargetHighlightRing.parent !== gameScene) gameScene.add(reusableTargetHighlightRing)
  return reusableTargetHighlightRing
}

export function updateAutoAimTargetHighlight(
  targetedEnemy: EnemyShip | null,
  gameScene: THREE.Scene,
  playerViewCamera: THREE.Camera,
): void {
  const highlightRing = getOrCreateTargetHighlightRing(gameScene)

  // STEP 1: no target — keep the single ring instance but hide it
  if (targetedEnemy === null) {
    highlightRing.visible = false
    return
  }

  // STEP 2: park the ring at the targeted enemy and face it toward the camera (D6 highlight)
  highlightRing.visible = true
  highlightRing.position.copy(targetedEnemy.positionMeters)
  highlightRing.quaternion.copy(playerViewCamera.quaternion)

  // STEP 3: gentle scale pulse so the lock-on reads as live
  const pulsePhaseRadians = performance.now() * 0.001 * HIGHLIGHT_RING_PULSE_SPEED_RADIANS_PER_SECOND
  const pulseScale = 1 + HIGHLIGHT_RING_PULSE_SCALE_AMPLITUDE * Math.sin(pulsePhaseRadians)
  highlightRing.scale.setScalar(pulseScale)
}
