import './viewEdgeStatusIndicators.css'

// D66/D88: on-view status indicator in the bottom-left corner.
//  - A small MISSILE charge meter: a rocket silhouette (CSS-masked) that fills bottom→top as the
//    missile recharges and glows when ready.
// D88 REMOVED the old vertical speed-upgrade level bar (it was confusing alongside the new bottom-right
// speed bar, and speed is now shown live there). Purely presentational — not a control.

export type ViewEdgeStatusIndicators = {
  /**
   * @param missileReadyFraction 0..1: 1 = missile fully recharged / ready to fire
   */
  updateViewEdgeStatusIndicators(missileReadyFraction: number): void
}

// rocket silhouette used as a CSS mask so the orange charge fill takes the missile shape (body
// filled + the three motion lines as strokes). Mirrors the MISSILE SPEED power-up icon.
const MISSILE_SILHOUETTE_SVG_MARKUP =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<path d="M14 4c3 1 5 4 5 7l-4 4c-3 0-6-2-7-5z" fill="black"/>' +
  '<path d="M3 12h4M3 16h5M3 8h3" stroke="black" stroke-width="2" stroke-linecap="round" fill="none"/>' +
  '</svg>'
const MISSILE_SILHOUETTE_MASK_CSS_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(MISSILE_SILHOUETTE_SVG_MARKUP)}")`

export function createViewEdgeStatusIndicators(viewHudOverlay: HTMLElement): ViewEdgeStatusIndicators {
  // missile charge meter (rocket silhouette filling bottom→top) in the bottom-left corner
  const missileChargeMeter = document.createElement('div')
  missileChargeMeter.className = 'missileChargeMeter'
  missileChargeMeter.style.setProperty('mask-image', MISSILE_SILHOUETTE_MASK_CSS_URL)
  missileChargeMeter.style.setProperty('-webkit-mask-image', MISSILE_SILHOUETTE_MASK_CSS_URL)
  const missileChargeTrack = document.createElement('div')
  missileChargeTrack.className = 'missileChargeTrack'
  const missileChargeFill = document.createElement('div')
  missileChargeFill.className = 'missileChargeFill'
  missileChargeMeter.appendChild(missileChargeTrack)
  missileChargeMeter.appendChild(missileChargeFill)
  viewHudOverlay.appendChild(missileChargeMeter)

  function clampFraction(rawFraction: number): number {
    return Math.max(0, Math.min(1, rawFraction))
  }

  return {
    updateViewEdgeStatusIndicators(missileReadyFraction): void {
      const clampedMissileFraction = clampFraction(missileReadyFraction)
      missileChargeFill.style.height = `${clampedMissileFraction * 100}%`
      missileChargeMeter.classList.toggle('missileChargeMeterReady', clampedMissileFraction >= 1)
    },
  }
}
