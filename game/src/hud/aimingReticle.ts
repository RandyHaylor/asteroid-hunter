import './aimingReticle.css'

// D49: a fixed, thin, always-on aiming reticle at the center of the ship view. Replaces the old
// depth-scaled green cone ring (D29), which jumped in size with the closest enemy and hid when none
// was ahead. Its diameter is a constant fraction of the view height ≈ the auto-aim cone's on-screen
// angular size, so the locked enemy sits inside it. Purely presentational; sized entirely in CSS.

export type AimingReticle = {
  /** D51: turn the reticle RED while actively locked/firing on an enemy (green when idle) */
  setEngaged(isEngaged: boolean): void
  /**
   * D79: anchor the reticle to a screen position (the ship's AIM point projected to screen) instead of
   * fixed center. In normal/manual flight the aim point is screen-center; during AI free-look the camera
   * pans away from the aim, so the reticle stays on the real aim point (it does NOT move with the camera).
   * Pass null to hide it (aim point behind camera / off screen).
   */
  setAimScreenPosition(screenXPixels: number | null, screenYPixels?: number): void
}

export function createAimingReticle(viewHudOverlay: HTMLElement): AimingReticle {
  const aimingReticleElement = document.createElement('div')
  aimingReticleElement.className = 'aimingReticle'
  viewHudOverlay.appendChild(aimingReticleElement)

  return {
    setEngaged(isEngaged: boolean): void {
      aimingReticleElement.classList.toggle('aimingReticleEngaged', isEngaged)
    },
    setAimScreenPosition(screenXPixels: number | null, screenYPixels?: number): void {
      if (screenXPixels === null || screenYPixels === undefined) {
        aimingReticleElement.style.display = 'none'
        return
      }
      aimingReticleElement.style.display = 'block'
      aimingReticleElement.style.left = `${screenXPixels}px`
      aimingReticleElement.style.top = `${screenYPixels}px`
    },
  }
}
