import * as THREE from 'three'
import './shipWeaponCrosshair.css'

// D52: a tiny empty red crosshair marking where the SHIP's weapons actually point — the ship's
// forward/aim direction projected into the view. Unlike the fixed screen-center reticle, this
// drifts off-center as the ship aims ahead of the camera, so the player can see the true weapon
// bore vs. where the camera is looking. Hidden whenever the aim point is behind the camera.

// an "empty center" crosshair — four short red strokes (top/right/bottom/left) with a gap in the
// middle so there's no center dot occluding the target
const WEAPON_CROSSHAIR_SVG_MARKUP = `
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12,2 L12,8 M12,16 L12,22 M2,12 L8,12 M16,12 L22,12" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>`

export type ShipWeaponCrosshair = {
  // worldAimPoint = a point in world space along the ship's forward (weapon) direction; project it
  // to the view and place the crosshair there. viewWidth/Height are the ship view's pixel size.
  updateShipWeaponCrosshair(
    worldAimPoint: THREE.Vector3,
    playerViewCamera: THREE.Camera,
    viewWidthPixels: number,
    viewHeightPixels: number,
  ): void
}

const scratchCameraSpacePosition = new THREE.Vector3()
const scratchNormalizedDeviceCoords = new THREE.Vector3()

export function createShipWeaponCrosshair(viewHudOverlay: HTMLElement): ShipWeaponCrosshair {
  const crosshairElement = document.createElement('div')
  crosshairElement.className = 'shipWeaponCrosshair'
  crosshairElement.innerHTML = WEAPON_CROSSHAIR_SVG_MARKUP
  viewHudOverlay.appendChild(crosshairElement)

  return {
    updateShipWeaponCrosshair(worldAimPoint, playerViewCamera, viewWidthPixels, viewHeightPixels): void {
      scratchCameraSpacePosition.copy(worldAimPoint).applyMatrix4(playerViewCamera.matrixWorldInverse)
      if (scratchCameraSpacePosition.z > 0) {
        crosshairElement.style.display = 'none' // aim point is behind the camera
        return
      }

      scratchNormalizedDeviceCoords.copy(worldAimPoint).project(playerViewCamera)
      const ndcX = scratchNormalizedDeviceCoords.x
      const ndcY = scratchNormalizedDeviceCoords.y

      const screenXPixels = (ndcX * 0.5 + 0.5) * viewWidthPixels
      const screenYPixels = (-ndcY * 0.5 + 0.5) * viewHeightPixels

      crosshairElement.style.left = `${screenXPixels}px`
      crosshairElement.style.top = `${screenYPixels}px`
      crosshairElement.style.display = 'block'
    },
  }
}
