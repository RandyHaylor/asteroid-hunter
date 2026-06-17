import * as THREE from 'three'
import './enemyTargetRings.css'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'

// D49/D50 → D67: EVERY live enemy gets an on-view red target reticle (no longer gated by radar
// detection). State drives the look:
//  - within the combined radar+weapon engagement range  → full-size rotating ring; the LOCKED enemy
//    spins faster and gently grows/shrinks (sine) so the lock reads as live.
//  - beyond the engagement range  → a much smaller, NON-rotating red circle (still always shown).
//  - off screen (either case)     → shrinks and clamps to the screen rim as a direction indicator.
// Auto-aim/auto-fire and condition bars are gated on the same range elsewhere (D67).

const ON_SCREEN_RING_PIXELS = 56
const OFF_SCREEN_RING_PIXELS = 26
const OUT_OF_RANGE_RING_PIXELS = 16 // D67: tiny static marker for enemies beyond engagement range
const SCREEN_EDGE_NDC_LIMIT = 0.9

// D67: the locked enemy's ring gently pulses in size (sine) on top of the faster CSS spin
const LOCKED_RING_PULSE_SPEED_RADIANS_PER_SECOND = 7
const LOCKED_RING_PULSE_AMPLITUDE = 0.16

// a ring + 4 radial ticks so the rotation is actually visible (a plain circle wouldn't read as spinning)
const TARGET_RETICLE_SVG_MARKUP = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="5"/>
  <path d="M50,2 L50,16 M50,84 L50,98 M2,50 L16,50 M84,50 L98,50" fill="none" stroke="currentColor" stroke-width="5"/>
</svg>`

export type EnemyTargetRings = {
  updateEnemyTargetRings(
    enemyShips: readonly EnemyShip[],
    playerPositionMeters: THREE.Vector3,
    combinedRadarWeaponRangeMeters: number,
    playerViewCamera: THREE.Camera,
    viewWidthPixels: number,
    viewHeightPixels: number,
    lockedEnemyShipId: number | null,
  ): void
}

const scratchCameraSpacePosition = new THREE.Vector3()
const scratchNormalizedDeviceCoords = new THREE.Vector3()

export function createEnemyTargetRings(viewHudOverlay: HTMLElement): EnemyTargetRings {
  const ringElementsByEnemyId = new Map<number, HTMLDivElement>()

  function getOrCreateRingElement(enemyShipId: number): HTMLDivElement {
    let ringElement = ringElementsByEnemyId.get(enemyShipId)
    if (!ringElement) {
      ringElement = document.createElement('div')
      ringElement.className = 'enemyTargetRing'
      const spinner = document.createElement('div')
      spinner.className = 'enemyTargetRingSpinner'
      spinner.innerHTML = TARGET_RETICLE_SVG_MARKUP
      ringElement.appendChild(spinner)
      viewHudOverlay.appendChild(ringElement)
      ringElementsByEnemyId.set(enemyShipId, ringElement)
    }
    return ringElement
  }

  return {
    updateEnemyTargetRings(
      enemyShips,
      playerPositionMeters,
      combinedRadarWeaponRangeMeters,
      playerViewCamera,
      viewWidthPixels,
      viewHeightPixels,
      lockedEnemyShipId,
    ): void {
      const enemyIdsShownThisFrame = new Set<number>()
      const lockedPulseScale =
        1 + LOCKED_RING_PULSE_AMPLITUDE * Math.sin(performance.now() * 0.001 * LOCKED_RING_PULSE_SPEED_RADIANS_PER_SECOND)

      for (const enemyShip of enemyShips) {
        if (enemyShip.isDestroyed) continue

        const distanceToPlayerMeters = enemyShip.positionMeters.distanceTo(playerPositionMeters)
        const isWithinEngagementRange = distanceToPlayerMeters <= combinedRadarWeaponRangeMeters
        const isLocked = enemyShip.enemyShipId === lockedEnemyShipId

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
        if (!isWithinEngagementRange) {
          // tiny static marker — never grows to full size even when on screen (D67)
          ringSizePixels = OUT_OF_RANGE_RING_PIXELS
        } else if (!isOnScreen) {
          ringSizePixels = OFF_SCREEN_RING_PIXELS
        } else {
          ringSizePixels = ON_SCREEN_RING_PIXELS
          if (isLocked) ringSizePixels *= lockedPulseScale // D67: sine grow/shrink on the locked ring
        }

        if (!isOnScreen) {
          // clamp the off-screen marker to the screen rim as a direction indicator
          const largestComponentMagnitude = Math.max(Math.abs(ndcX), Math.abs(ndcY))
          if (largestComponentMagnitude === 0) {
            ndcY = SCREEN_EDGE_NDC_LIMIT
          } else {
            const clampScale = SCREEN_EDGE_NDC_LIMIT / largestComponentMagnitude
            ndcX *= clampScale
            ndcY *= clampScale
          }
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
        ringElement.style.opacity = '1'
        // D67: out-of-range markers don't spin; the locked one spins faster (both via CSS classes)
        ringElement.classList.toggle('enemyTargetRingOutOfRange', !isWithinEngagementRange)
        ringElement.classList.toggle('enemyTargetRingLocked', isLocked && isWithinEngagementRange)
      }

      // drop rings for enemies no longer present (destroyed / removed)
      for (const [enemyShipId, ringElement] of ringElementsByEnemyId) {
        if (enemyIdsShownThisFrame.has(enemyShipId)) continue
        viewHudOverlay.removeChild(ringElement)
        ringElementsByEnemyId.delete(enemyShipId)
      }
    },
  }
}
