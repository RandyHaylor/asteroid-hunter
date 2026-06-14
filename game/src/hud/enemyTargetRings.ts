import * as THREE from 'three'
import './enemyTargetRings.css'
import type { RadarContactReading } from '../radar/radarSignatureTracker'

// D49/D50: every radar-tracked enemy gets a rotating target reticle. On screen it encircles the
// enemy; when off screen the reticle SHRINKS and clamps to the screen rim as a direction indicator.
// D50: color carries the radar state — RED for a visible (clear-sight) contact, YELLOW for a
// last-seen (obscured/fading) contact at its last-known spot. The locked enemy's ring glows.
// Driven by the radar contact readings (same source as the old edge markers) so the visible/
// last-seen mechanic is preserved; the ring is just the new visual.

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
    contactReadings: readonly RadarContactReading[],
    playerViewCamera: THREE.Camera,
    viewWidthPixels: number,
    viewHeightPixels: number,
    lockedEnemyShipId: number | null,
  ): void
}

const scratchCameraSpacePosition = new THREE.Vector3()
const scratchNormalizedDeviceCoords = new THREE.Vector3()

export function createEnemyTargetRings(viewHudOverlay: HTMLElement): EnemyTargetRings {
  const ringElementsByContactId = new Map<number, HTMLDivElement>()

  function getOrCreateRingElement(contactSignatureId: number): HTMLDivElement {
    let ringElement = ringElementsByContactId.get(contactSignatureId)
    if (!ringElement) {
      ringElement = document.createElement('div')
      ringElement.className = 'enemyTargetRing'
      const spinner = document.createElement('div')
      spinner.className = 'enemyTargetRingSpinner'
      spinner.innerHTML = TARGET_RETICLE_SVG_MARKUP
      ringElement.appendChild(spinner)
      viewHudOverlay.appendChild(ringElement)
      ringElementsByContactId.set(contactSignatureId, ringElement)
    }
    return ringElement
  }

  return {
    updateEnemyTargetRings(contactReadings, playerViewCamera, viewWidthPixels, viewHeightPixels, lockedEnemyShipId): void {
      const contactIdsShownThisFrame = new Set<number>()

      for (const contactReading of contactReadings) {
        scratchCameraSpacePosition.copy(contactReading.positionMeters).applyMatrix4(playerViewCamera.matrixWorldInverse)
        const isBehindCamera = scratchCameraSpacePosition.z > 0

        scratchNormalizedDeviceCoords.copy(contactReading.positionMeters).project(playerViewCamera)
        let ndcX = scratchNormalizedDeviceCoords.x
        let ndcY = scratchNormalizedDeviceCoords.y
        if (isBehindCamera) {
          ndcX = -ndcX
          ndcY = -ndcY
        }

        const isOnScreen = !isBehindCamera && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1
        let ringSizePixels: number
        if (!isOnScreen) {
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

        const ringElement = getOrCreateRingElement(contactReading.contactSignatureId)
        contactIdsShownThisFrame.add(contactReading.contactSignatureId)
        const isLastSeen = contactReading.contactState === 'lastSeenFading'
        ringElement.style.width = `${ringSizePixels}px`
        ringElement.style.height = `${ringSizePixels}px`
        ringElement.style.left = `${screenXPixels}px`
        ringElement.style.top = `${screenYPixels}px`
        ringElement.style.display = 'block'
        // D50: yellow + fade for last-seen; red for visible
        ringElement.classList.toggle('enemyTargetRingLastSeen', isLastSeen)
        ringElement.style.opacity = isLastSeen ? `${0.3 + 0.6 * contactReading.fadeRemainingFraction}` : '1'
        ringElement.classList.toggle('enemyTargetRingLocked', contactReading.contactSignatureId === lockedEnemyShipId)
      }

      // drop rings for contacts no longer reported (destroyed, re-detected as the same, or aged out)
      for (const [contactSignatureId, ringElement] of ringElementsByContactId) {
        if (contactIdsShownThisFrame.has(contactSignatureId)) continue
        viewHudOverlay.removeChild(ringElement)
        ringElementsByContactId.delete(contactSignatureId)
      }
    },
  }
}
