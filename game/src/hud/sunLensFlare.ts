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
    /** D48: ship view pixel size (4:3) — the flare maps to the view, not the full window */
    viewWidthPixels: number,
    viewHeightPixels: number,
  ): void
}

// D92: several ghost rings strung along the sun→mirror axis (classic multi-element lens flare). Each
// is placed at a fraction of the way from the sun to its center-mirror point, with its own size/fade.
const FLARE_GHOST_RINGS = [
  { axisLerpFraction: 0.35, diameterPixels: 70, opacityMultiplier: 0.5 },
  { axisLerpFraction: 0.62, diameterPixels: 44, opacityMultiplier: 0.38 },
  { axisLerpFraction: 1.0, diameterPixels: 120, opacityMultiplier: 0.5 }, // the original mirrored ghost
]

export function createSunLensFlare(hudOverlayRoot: HTMLElement): SunLensFlare {
  const flareCoreRing = document.createElement('div')
  flareCoreRing.className = 'sunLensFlareCore'
  hudOverlayRoot.appendChild(flareCoreRing)

  const flareGhostRingElements = FLARE_GHOST_RINGS.map((ghostSpec) => {
    const ghostRing = document.createElement('div')
    ghostRing.className = 'sunLensFlareGhost'
    ghostRing.style.width = `${ghostSpec.diameterPixels}px`
    ghostRing.style.height = `${ghostSpec.diameterPixels}px`
    hudOverlayRoot.appendChild(ghostRing)
    return ghostRing
  })

  function hideFlare(): void {
    flareCoreRing.style.display = 'none'
    for (const ghostRing of flareGhostRingElements) ghostRing.style.display = 'none'
  }

  return {
    updateSunLensFlare(sunWorldPosition, playerViewCamera, viewWidthPixels, viewHeightPixels): void {
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

      const viewportWidthPixels = viewWidthPixels
      const viewportHeightPixels = viewHeightPixels
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

      // place each ghost ring at its fraction along the sun→mirror axis
      for (let ghostIndex = 0; ghostIndex < flareGhostRingElements.length; ghostIndex++) {
        const ghostRing = flareGhostRingElements[ghostIndex]
        const ghostSpec = FLARE_GHOST_RINGS[ghostIndex]
        const ghostX = sunScreenXPixels + (ghostScreenXPixels - sunScreenXPixels) * ghostSpec.axisLerpFraction
        const ghostY = sunScreenYPixels + (ghostScreenYPixels - sunScreenYPixels) * ghostSpec.axisLerpFraction
        ghostRing.style.display = 'block'
        ghostRing.style.left = `${ghostX}px`
        ghostRing.style.top = `${ghostY}px`
        ghostRing.style.opacity = `${flareOpacity * ghostSpec.opacityMultiplier}`
      }
    },
  }
}
