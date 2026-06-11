import * as THREE from 'three'
import './sunLensFlare.css'

// D31: a faux lens flare for when the sun is in view — a hazy yellow ring sitting on the sun's
// screen position plus a fainter "ghost" ring mirrored across screen center, so as you turn the
// flare slides across the screen the way a real lens flare tracks the light source. Pure overlay;
// no postprocessing. Hidden whenever the sun is behind the camera or off screen.

const scratchCameraSpacePosition = new THREE.Vector3()
const scratchNormalizedDeviceCoords = new THREE.Vector3()

export type SunLensFlare = {
  updateSunLensFlare(
    sunWorldPosition: THREE.Vector3,
    playerViewCamera: THREE.Camera,
    /** D35: square view pixel size — the flare maps to the square, not the full window */
    squareViewportSizePixels: number,
  ): void
}

export function createSunLensFlare(hudOverlayRoot: HTMLElement): SunLensFlare {
  const flareCoreRing = document.createElement('div')
  flareCoreRing.className = 'sunLensFlareCore'
  hudOverlayRoot.appendChild(flareCoreRing)

  const flareGhostRing = document.createElement('div')
  flareGhostRing.className = 'sunLensFlareGhost'
  hudOverlayRoot.appendChild(flareGhostRing)

  function hideFlare(): void {
    flareCoreRing.style.display = 'none'
    flareGhostRing.style.display = 'none'
  }

  return {
    updateSunLensFlare(sunWorldPosition, playerViewCamera, squareViewportSizePixels): void {
      scratchCameraSpacePosition.copy(sunWorldPosition).applyMatrix4(playerViewCamera.matrixWorldInverse)
      if (scratchCameraSpacePosition.z > 0) {
        hideFlare() // sun is behind the camera
        return
      }

      scratchNormalizedDeviceCoords.copy(sunWorldPosition).project(playerViewCamera)
      const ndcX = scratchNormalizedDeviceCoords.x
      const ndcY = scratchNormalizedDeviceCoords.y
      // a little margin past the edge still shows a partial flare creeping in
      if (Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2) {
        hideFlare()
        return
      }

      const viewportWidthPixels = squareViewportSizePixels
      const viewportHeightPixels = squareViewportSizePixels
      const sunScreenXPixels = (ndcX * 0.5 + 0.5) * viewportWidthPixels
      const sunScreenYPixels = (-ndcY * 0.5 + 0.5) * viewportHeightPixels

      // the ghost mirrors the sun across screen center — classic lens-flare behaviour
      const ghostScreenXPixels = viewportWidthPixels - sunScreenXPixels
      const ghostScreenYPixels = viewportHeightPixels - sunScreenYPixels

      // fade as the sun nears/leaves the frame edge
      const edgeProximity = Math.max(Math.abs(ndcX), Math.abs(ndcY))
      const flareOpacity = Math.max(0, Math.min(1, 1.2 - edgeProximity))

      flareCoreRing.style.display = 'block'
      flareCoreRing.style.left = `${sunScreenXPixels}px`
      flareCoreRing.style.top = `${sunScreenYPixels}px`
      flareCoreRing.style.opacity = `${flareOpacity}`

      flareGhostRing.style.display = 'block'
      flareGhostRing.style.left = `${ghostScreenXPixels}px`
      flareGhostRing.style.top = `${ghostScreenYPixels}px`
      flareGhostRing.style.opacity = `${flareOpacity * 0.5}`
    },
  }
}
