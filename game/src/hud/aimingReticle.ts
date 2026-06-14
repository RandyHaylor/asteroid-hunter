import './aimingReticle.css'

// D49: a fixed, thin, always-on aiming reticle at the center of the ship view. Replaces the old
// depth-scaled green cone ring (D29), which jumped in size with the closest enemy and hid when none
// was ahead. Its diameter is a constant fraction of the view height ≈ the auto-aim cone's on-screen
// angular size, so the locked enemy sits inside it. Purely presentational; sized entirely in CSS.

export function createAimingReticle(viewHudOverlay: HTMLElement): void {
  const aimingReticleElement = document.createElement('div')
  aimingReticleElement.className = 'aimingReticle'
  viewHudOverlay.appendChild(aimingReticleElement)
}
