import * as THREE from 'three'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'
import {
  ENEMY_SHIP_MAX_HULL_POINTS,
  ENEMY_SHIP_MAX_SHIELD_POINTS,
} from './enemyShipDamage'

// D21/D24: a blue shield bar and red hull bar float above every live enemy (D24 dropped the
// original "only after it takes a hit" gate, so the bars double as always-on spot markers that
// make distant enemies easier to find). The bars billboard to the player's camera every frame,
// so "above" is always screen-up.

const BAR_WIDTH_METERS = 11 // D67: bigger (was 7) — easier to read
const BAR_HEIGHT_METERS = 0.9 // D67: bigger (was 0.55)
const BAR_VERTICAL_GAP_METERS = 0.4 // D67: bigger gap to match (was 0.3)
const BARS_OFFSET_ABOVE_SHIP_METERS = 9 // D56: clear the now-3×-larger enemy model
// D46: keep the bars a CONSTANT on-screen size regardless of distance — world size is scaled by
// distanceToCamera / this reference, so a far enemy's bars stay just as large as a near one's.
const BARS_REFERENCE_DISTANCE_METERS = 90
const BARS_MIN_DISTANCE_SCALE = 0.35

const sharedUnitBarGeometry = new THREE.PlaneGeometry(1, 1)
// D56: draw the bars ON TOP without depth testing/writing so the shield/hull fills never z-fight the
// background plane or the enemy hull (that flicker made them unreadable). Layering is by renderOrder.
const sharedBarBackgroundMaterial = new THREE.MeshBasicMaterial({
  color: 0x101820,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
})
const sharedShieldFillMaterial = new THREE.MeshBasicMaterial({
  color: 0x44aaff,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
})
const sharedHullFillMaterial = new THREE.MeshBasicMaterial({
  color: 0xff4444,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
})

// D67: bars render with depthTest off (so the fill never z-fights the background or the hull). To
// stop the OTHER flicker — three.js re-sorting equal-renderOrder transparent objects by distance
// every frame, flipping draw order between near-equal-distance bars — each enemy's bar group gets a
// UNIQUE, STABLE renderOrder band so the painter order is deterministic and never re-sorts.
const BARS_RENDER_ORDER_BASE = 20
const BARS_RENDER_ORDER_STRIDE = 2 // background at band+0, fill at band+1, per enemy

type EnemyConditionBarGroup = {
  barsGroup: THREE.Group
  shieldFillMesh: THREE.Mesh
  hullFillMesh: THREE.Mesh
}

function setBarFillFraction(fillMesh: THREE.Mesh, fillFraction: number): void {
  const clampedFraction = Math.max(0.0001, Math.min(1, fillFraction))
  fillMesh.scale.x = clampedFraction * BAR_WIDTH_METERS
  // keep the fill anchored to the bar's left edge as it shrinks
  fillMesh.position.x = -((1 - clampedFraction) * BAR_WIDTH_METERS) / 2
}

function buildEnemyConditionBarGroup(renderOrderBand: number): EnemyConditionBarGroup {
  const barsGroup = new THREE.Group()
  const backgroundRenderOrder = renderOrderBand
  const fillRenderOrder = renderOrderBand + 1

  const shieldRowY = (BAR_HEIGHT_METERS + BAR_VERTICAL_GAP_METERS) / 2
  const hullRowY = -shieldRowY

  const shieldBackgroundMesh = new THREE.Mesh(sharedUnitBarGeometry, sharedBarBackgroundMaterial)
  shieldBackgroundMesh.scale.set(BAR_WIDTH_METERS, BAR_HEIGHT_METERS, 1)
  shieldBackgroundMesh.position.y = shieldRowY
  shieldBackgroundMesh.renderOrder = backgroundRenderOrder
  barsGroup.add(shieldBackgroundMesh)

  const hullBackgroundMesh = new THREE.Mesh(sharedUnitBarGeometry, sharedBarBackgroundMaterial)
  hullBackgroundMesh.scale.set(BAR_WIDTH_METERS, BAR_HEIGHT_METERS, 1)
  hullBackgroundMesh.position.y = hullRowY
  hullBackgroundMesh.renderOrder = backgroundRenderOrder
  barsGroup.add(hullBackgroundMesh)

  const shieldFillMesh = new THREE.Mesh(sharedUnitBarGeometry, sharedShieldFillMaterial)
  shieldFillMesh.scale.set(BAR_WIDTH_METERS, BAR_HEIGHT_METERS * 0.7, 1)
  shieldFillMesh.position.set(0, shieldRowY, 0.01)
  shieldFillMesh.renderOrder = fillRenderOrder
  barsGroup.add(shieldFillMesh)

  const hullFillMesh = new THREE.Mesh(sharedUnitBarGeometry, sharedHullFillMaterial)
  hullFillMesh.scale.set(BAR_WIDTH_METERS, BAR_HEIGHT_METERS * 0.7, 1)
  hullFillMesh.position.set(0, hullRowY, 0.01)
  hullFillMesh.renderOrder = fillRenderOrder
  barsGroup.add(hullFillMesh)

  return { barsGroup, shieldFillMesh, hullFillMesh }
}

export type EnemyConditionBarsDisplay = {
  updateEnemyConditionBars(
    enemyShips: readonly EnemyShip[],
    playerViewCamera: THREE.Camera,
    playerPositionMeters: THREE.Vector3,
    combinedRadarWeaponRangeMeters: number,
  ): void
  /** number of enemies currently showing bars (used by dev verification) */
  getActiveBarCount(): number
}

const scratchCameraUpDirection = new THREE.Vector3()

export function createEnemyConditionBarsDisplay(gameScene: THREE.Scene): EnemyConditionBarsDisplay {
  const barGroupsByEnemyShipId = new Map<number, EnemyConditionBarGroup>()
  // monotonic allocator for the per-enemy unique renderOrder band (D67 anti-flicker)
  let nextRenderOrderBand = BARS_RENDER_ORDER_BASE

  return {
    updateEnemyConditionBars(enemyShips, playerViewCamera, playerPositionMeters, combinedRadarWeaponRangeMeters): void {
      const enemyIdsWithVisibleBars = new Set<number>()

      // camera-up so the bars sit "above" the ship from the player's point of view
      scratchCameraUpDirection.set(0, 1, 0).applyQuaternion(playerViewCamera.quaternion)
      const cameraWorldPosition = playerViewCamera.position

      for (const enemyShip of enemyShips) {
        if (enemyShip.isDestroyed) continue // D24: bars show for every live enemy, damaged or not
        // D67: no bars for out-of-range enemies (they show only the tiny static target ring)
        if (enemyShip.positionMeters.distanceTo(playerPositionMeters) > combinedRadarWeaponRangeMeters) continue

        let conditionBars = barGroupsByEnemyShipId.get(enemyShip.enemyShipId)
        if (!conditionBars) {
          conditionBars = buildEnemyConditionBarGroup(nextRenderOrderBand)
          nextRenderOrderBand += BARS_RENDER_ORDER_STRIDE
          gameScene.add(conditionBars.barsGroup)
          barGroupsByEnemyShipId.set(enemyShip.enemyShipId, conditionBars)
        }
        enemyIdsWithVisibleBars.add(enemyShip.enemyShipId)

        // D46: constant on-screen size — scale the whole bar group (and its above-ship offset) by
        // distance so perspective shrink is cancelled out
        const distanceToCameraMeters = enemyShip.positionMeters.distanceTo(cameraWorldPosition)
        const distanceScale = Math.max(BARS_MIN_DISTANCE_SCALE, distanceToCameraMeters / BARS_REFERENCE_DISTANCE_METERS)
        conditionBars.barsGroup.position
          .copy(enemyShip.positionMeters)
          .addScaledVector(scratchCameraUpDirection, BARS_OFFSET_ABOVE_SHIP_METERS * distanceScale)
        conditionBars.barsGroup.quaternion.copy(playerViewCamera.quaternion)
        conditionBars.barsGroup.scale.setScalar(distanceScale)

        setBarFillFraction(conditionBars.shieldFillMesh, enemyShip.shieldPointsRemaining / ENEMY_SHIP_MAX_SHIELD_POINTS)
        setBarFillFraction(conditionBars.hullFillMesh, enemyShip.hitPointsRemaining / ENEMY_SHIP_MAX_HULL_POINTS)
      }

      // drop bars for enemies that died or despawned (wave clear/restart)
      for (const [enemyShipId, conditionBars] of barGroupsByEnemyShipId) {
        if (enemyIdsWithVisibleBars.has(enemyShipId)) continue
        gameScene.remove(conditionBars.barsGroup)
        barGroupsByEnemyShipId.delete(enemyShipId)
      }
    },
    getActiveBarCount(): number {
      return barGroupsByEnemyShipId.size
    },
  }
}
