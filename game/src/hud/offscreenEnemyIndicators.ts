import * as THREE from 'three'
import './offscreenEnemyIndicators.css'
import type { RadarContactReading } from '../radar/radarSignatureTracker'

// D28: edge-of-screen floating markers for enemies that are NOT currently on screen. Each marker is
// pinned to the screen rim in the direction of the enemy. Driven by the radar contact readings so:
//   - a 'visible' contact off the edge → solid RED marker at its true current position
//   - a 'lastSeenFading' contact (slipped behind an asteroid) → YELLOW marker at its last-known spot
// Marker SIZE scales with proximity (closer enemy = bigger), so you can read range at a glance.

const SCREEN_EDGE_NDC_LIMIT = 0.9 // how close to the rim markers clamp (1 = exact edge)
const NEAR_RANGE_METERS = 80 // at/under this distance the marker is at its biggest
const FAR_RANGE_METERS = 1100 // at/over this distance the marker is at its smallest
const MARKER_MAX_SIZE_PIXELS = 38
const MARKER_MIN_SIZE_PIXELS = 13

export type OffscreenEnemyIndicators = {
  updateOffscreenEnemyIndicators(
    contactReadings: readonly RadarContactReading[],
    playerViewCamera: THREE.Camera,
    playerPositionMeters: THREE.Vector3,
  ): void
}

const scratchCameraSpacePosition = new THREE.Vector3()
const scratchNormalizedDeviceCoords = new THREE.Vector3()

function mapRangeToMarkerSizePixels(distanceMeters: number): number {
  const nearToFarFraction = Math.max(
    0,
    Math.min(1, (distanceMeters - NEAR_RANGE_METERS) / (FAR_RANGE_METERS - NEAR_RANGE_METERS)),
  )
  return MARKER_MAX_SIZE_PIXELS + (MARKER_MIN_SIZE_PIXELS - MARKER_MAX_SIZE_PIXELS) * nearToFarFraction
}

export function createOffscreenEnemyIndicators(hudOverlayRoot: HTMLElement): OffscreenEnemyIndicators {
  const markerElementsByContactId = new Map<number, HTMLDivElement>()

  function getOrCreateMarkerElement(contactSignatureId: number): HTMLDivElement {
    let markerElement = markerElementsByContactId.get(contactSignatureId)
    if (!markerElement) {
      markerElement = document.createElement('div')
      markerElement.className = 'offscreenEnemyIndicator'
      hudOverlayRoot.appendChild(markerElement)
      markerElementsByContactId.set(contactSignatureId, markerElement)
    }
    return markerElement
  }

  return {
    updateOffscreenEnemyIndicators(contactReadings, playerViewCamera, playerPositionMeters): void {
      const viewportWidthPixels = window.innerWidth
      const viewportHeightPixels = window.innerHeight
      const contactIdsShownThisFrame = new Set<number>()

      for (const contactReading of contactReadings) {
        // camera-space z > 0 means the contact is behind the camera (camera looks down -z)
        scratchCameraSpacePosition
          .copy(contactReading.positionMeters)
          .applyMatrix4(playerViewCamera.matrixWorldInverse)
        const isBehindCamera = scratchCameraSpacePosition.z > 0

        scratchNormalizedDeviceCoords.copy(contactReading.positionMeters).project(playerViewCamera)
        let ndcX = scratchNormalizedDeviceCoords.x
        let ndcY = scratchNormalizedDeviceCoords.y
        // behind the camera the projection is mirrored — flip it so the bearing points the right way
        if (isBehindCamera) {
          ndcX = -ndcX
          ndcY = -ndcY
        }

        const isOnScreen =
          !isBehindCamera && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1
        if (isOnScreen) continue // on screen → the enemy is visible in the world, no edge marker

        // radially clamp the bearing onto the screen rim (largest component reaches the edge)
        const largestComponentMagnitude = Math.max(Math.abs(ndcX), Math.abs(ndcY))
        if (largestComponentMagnitude === 0) {
          ndcY = SCREEN_EDGE_NDC_LIMIT
        } else {
          const clampScale = SCREEN_EDGE_NDC_LIMIT / largestComponentMagnitude
          ndcX *= clampScale
          ndcY *= clampScale
        }

        const screenXPixels = (ndcX * 0.5 + 0.5) * viewportWidthPixels
        const screenYPixels = (-ndcY * 0.5 + 0.5) * viewportHeightPixels

        const distanceMeters = contactReading.positionMeters.distanceTo(playerPositionMeters)
        const markerSizePixels = mapRangeToMarkerSizePixels(distanceMeters)

        const markerElement = getOrCreateMarkerElement(contactReading.contactSignatureId)
        contactIdsShownThisFrame.add(contactReading.contactSignatureId)
        const isLastSeen = contactReading.contactState === 'lastSeenFading'
        markerElement.classList.toggle('offscreenEnemyIndicatorLastSeen', isLastSeen)
        markerElement.style.width = `${markerSizePixels}px`
        markerElement.style.height = `${markerSizePixels}px`
        markerElement.style.left = `${screenXPixels}px`
        markerElement.style.top = `${screenYPixels}px`
        markerElement.style.opacity = isLastSeen
          ? `${0.3 + 0.6 * contactReading.fadeRemainingFraction}`
          : '0.95'
        markerElement.style.display = 'block'
      }

      // hide/drop markers whose contact wasn't shown this frame (on screen, resolved, or destroyed)
      for (const [contactSignatureId, markerElement] of markerElementsByContactId) {
        if (contactIdsShownThisFrame.has(contactSignatureId)) continue
        hudOverlayRoot.removeChild(markerElement)
        markerElementsByContactId.delete(contactSignatureId)
      }
    },
  }
}
