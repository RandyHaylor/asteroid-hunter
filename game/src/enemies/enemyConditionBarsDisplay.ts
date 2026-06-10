import * as THREE from 'three'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'
import {
  ENEMY_SHIP_MAX_HULL_POINTS,
  ENEMY_SHIP_MAX_SHIELD_POINTS,
  enemyShipHasTakenAnyDamage,
} from './enemyShipDamage'

// D21: once an enemy takes a hit, a blue shield bar and red hull bar float above it.
// The bars billboard to the player's camera every frame, so "above" is always screen-up.

const BAR_WIDTH_METERS = 7
const BAR_HEIGHT_METERS = 0.55
const BAR_VERTICAL_GAP_METERS = 0.3
const BARS_OFFSET_ABOVE_SHIP_METERS = 6

const sharedUnitBarGeometry = new THREE.PlaneGeometry(1, 1)
const sharedBarBackgroundMaterial = new THREE.MeshBasicMaterial({
  color: 0x101820,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide,
})
const sharedShieldFillMaterial = new THREE.MeshBasicMaterial({ color: 0x44aaff, side: THREE.DoubleSide })
const sharedHullFillMaterial = new THREE.MeshBasicMaterial({ color: 0xff4444, side: THREE.DoubleSide })

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

function buildEnemyConditionBarGroup(): EnemyConditionBarGroup {
  const barsGroup = new THREE.Group()

  const shieldRowY = (BAR_HEIGHT_METERS + BAR_VERTICAL_GAP_METERS) / 2
  const hullRowY = -shieldRowY

  const shieldBackgroundMesh = new THREE.Mesh(sharedUnitBarGeometry, sharedBarBackgroundMaterial)
  shieldBackgroundMesh.scale.set(BAR_WIDTH_METERS, BAR_HEIGHT_METERS, 1)
  shieldBackgroundMesh.position.y = shieldRowY
  barsGroup.add(shieldBackgroundMesh)

  const hullBackgroundMesh = new THREE.Mesh(sharedUnitBarGeometry, sharedBarBackgroundMaterial)
  hullBackgroundMesh.scale.set(BAR_WIDTH_METERS, BAR_HEIGHT_METERS, 1)
  hullBackgroundMesh.position.y = hullRowY
  barsGroup.add(hullBackgroundMesh)

  const shieldFillMesh = new THREE.Mesh(sharedUnitBarGeometry, sharedShieldFillMaterial)
  shieldFillMesh.scale.set(BAR_WIDTH_METERS, BAR_HEIGHT_METERS * 0.7, 1)
  shieldFillMesh.position.set(0, shieldRowY, 0.01)
  barsGroup.add(shieldFillMesh)

  const hullFillMesh = new THREE.Mesh(sharedUnitBarGeometry, sharedHullFillMaterial)
  hullFillMesh.scale.set(BAR_WIDTH_METERS, BAR_HEIGHT_METERS * 0.7, 1)
  hullFillMesh.position.set(0, hullRowY, 0.01)
  barsGroup.add(hullFillMesh)

  return { barsGroup, shieldFillMesh, hullFillMesh }
}

export type EnemyConditionBarsDisplay = {
  updateEnemyConditionBars(enemyShips: readonly EnemyShip[], playerViewCamera: THREE.Camera): void
  /** number of enemies currently showing bars (used by dev verification) */
  getActiveBarCount(): number
}

const scratchCameraUpDirection = new THREE.Vector3()

export function createEnemyConditionBarsDisplay(gameScene: THREE.Scene): EnemyConditionBarsDisplay {
  const barGroupsByEnemyShipId = new Map<number, EnemyConditionBarGroup>()

  return {
    updateEnemyConditionBars(enemyShips: readonly EnemyShip[], playerViewCamera: THREE.Camera): void {
      const enemyIdsWithVisibleBars = new Set<number>()

      // camera-up so the bars sit "above" the ship from the player's point of view
      scratchCameraUpDirection.set(0, 1, 0).applyQuaternion(playerViewCamera.quaternion)

      for (const enemyShip of enemyShips) {
        if (enemyShip.isDestroyed || !enemyShipHasTakenAnyDamage(enemyShip)) continue

        let conditionBars = barGroupsByEnemyShipId.get(enemyShip.enemyShipId)
        if (!conditionBars) {
          conditionBars = buildEnemyConditionBarGroup()
          gameScene.add(conditionBars.barsGroup)
          barGroupsByEnemyShipId.set(enemyShip.enemyShipId, conditionBars)
        }
        enemyIdsWithVisibleBars.add(enemyShip.enemyShipId)

        conditionBars.barsGroup.position
          .copy(enemyShip.positionMeters)
          .addScaledVector(scratchCameraUpDirection, BARS_OFFSET_ABOVE_SHIP_METERS)
        conditionBars.barsGroup.quaternion.copy(playerViewCamera.quaternion)

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
