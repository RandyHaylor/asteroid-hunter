import * as THREE from 'three'
import './enemyTargetRings.css'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'

// D49: every live enemy gets a rotating RED target reticle. On screen it encircles the enemy; when
// the enemy is off screen the reticle SHRINKS and clamps to the screen rim as a direction indicator.
// The currently-locked enemy's ring gets a brighter "locked" style. Replaces the old edge dot
// markers (D28) and the single lock-highlight ring (D6).

const ON_SCREEN_RING_PIXELS = 56
const OFF_SCREEN_RING_PIXELS = 26
const SCREEN_EDGE_NDC_LIMIT = 0.9

// a ring + 4 radial ticks so the rotation is actually visible (a plain circle wouldn't read as spinning)
const TARGET_RETICLE_SVG_MARKUP = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="5"/>
  <path d="M50,2 L50,16 M50,84 L50,98 M2,50 L16,50 M84,50 L98,50" fill="none" stroke="currentColor" stroke-width="5"/>
</svg>`

export type EnemyTargetRings = {
  updateEnemyTargetRings(
    enemyShips: readonly EnemyShip[],
    playerViewCamera: THREE.Camera,
    viewWidthPixels: number,
    viewHeightPixels: number,
    lockedEnemyShipId: number | null,
  ): void
}

const scratchCameraSpacePosition = new THREE.Vector3()
const scratchNormalizedDeviceCoords = new THREE.Vector3()

export function createEnemyTargetRings(viewHudOverlay: HTMLElement): EnemyTargetRings {
  const ringElementsByEnemyShipId = new Map<number, HTMLDivElement>()

  function getOrCreateRingElement(enemyShipId: number): HTMLDivElement {
    let ringElement = ringElementsByEnemyShipId.get(enemyShipId)
    if (!ringElement) {
      ringElement = document.createElement('div')
      ringElement.className = 'enemyTargetRing'
      const spinner = document.createElement('div')
      spinner.className = 'enemyTargetRingSpinner'
      spinner.innerHTML = TARGET_RETICLE_SVG_MARKUP
      ringElement.appendChild(spinner)
      viewHudOverlay.appendChild(ringElement)
      ringElementsByEnemyShipId.set(enemyShipId, ringElement)
    }
    return ringElement
  }

  return {
    updateEnemyTargetRings(enemyShips, playerViewCamera, viewWidthPixels, viewHeightPixels, lockedEnemyShipId): void {
      const enemyIdsShownThisFrame = new Set<number>()

      for (const enemyShip of enemyShips) {
        if (enemyShip.isDestroyed) continue

        scratchCameraSpacePosition.copy(enemyShip.positionMeters).applyMatrix4(playerViewCamera.matrixWorldInverse)
        const isBehindCamera = scratchCameraSpacePosition.z > 0

        scratchNormalizedDeviceCoords.copy(enemyShip.positionMeters).project(playerViewCamera)
        let ndcX = scratchNormalizedDeviceCoords.x
        let ndcY = scratchNormalizedDeviceCoords.y
        if (isBehindCamera) {
          ndcX = -ndcX
          ndcY = -ndcY
        }

        const isOnScreen = !isBehindCamera && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1
        let ringSizePixels: number
        if (!isOnScreen) {
          // off screen → shrink + clamp the bearing onto the screen rim (direction indicator)
          ringSizePixels = OFF_SCREEN_RING_PIXELS
          const largestComponentMagnitude = Math.max(Math.abs(ndcX), Math.abs(ndcY))
          if (largestComponentMagnitude === 0) {
            ndcY = SCREEN_EDGE_NDC_LIMIT
          } else {
            const clampScale = SCREEN_EDGE_NDC_LIMIT / largestComponentMagnitude
            ndcX *= clampScale
            ndcY *= clampScale
          }
        } else {
          ringSizePixels = ON_SCREEN_RING_PIXELS
        }

        const screenXPixels = (ndcX * 0.5 + 0.5) * viewWidthPixels
        const screenYPixels = (-ndcY * 0.5 + 0.5) * viewHeightPixels

        const ringElement = getOrCreateRingElement(enemyShip.enemyShipId)
        enemyIdsShownThisFrame.add(enemyShip.enemyShipId)
        ringElement.style.width = `${ringSizePixels}px`
        ringElement.style.height = `${ringSizePixels}px`
        ringElement.style.left = `${screenXPixels}px`
        ringElement.style.top = `${screenYPixels}px`
        ringElement.style.display = 'block'
        ringElement.classList.toggle('enemyTargetRingLocked', enemyShip.enemyShipId === lockedEnemyShipId)
      }

      // drop rings for enemies that died or despawned this frame
      for (const [enemyShipId, ringElement] of ringElementsByEnemyShipId) {
        if (enemyIdsShownThisFrame.has(enemyShipId)) continue
        viewHudOverlay.removeChild(ringElement)
        ringElementsByEnemyShipId.delete(enemyShipId)
      }
    },
  }
}
