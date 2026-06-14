import './cockpitFrameOverlay.css'

// D48: in cockpit view, an SVG canopy frame overlays the ship view (A-pillars, top arch, center
// strut, and a dashboard console) so it reads as looking out from inside the ship. Shown only in
// cockpit mode; pointer-transparent. Stretches to the (4:3) view via preserveAspectRatio="none".

export type CockpitFrameOverlay = {
  setCockpitFrameVisible(visible: boolean): void
}

const COCKPIT_FRAME_SVG_MARKUP = `
<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M0,15 Q50,5 100,15" fill="none" stroke="rgba(22,30,44,0.75)" stroke-width="3.5"/>
  <path d="M0,0 L27,33" fill="none" stroke="rgba(22,30,44,0.75)" stroke-width="3.5"/>
  <path d="M100,0 L73,33" fill="none" stroke="rgba(22,30,44,0.75)" stroke-width="3.5"/>
  <path d="M50,5 L50,40" fill="none" stroke="rgba(22,30,44,0.55)" stroke-width="2"/>
  <path d="M0,84 Q50,75 100,84 L100,100 L0,100 Z" fill="rgba(12,18,28,0.8)" stroke="rgba(90,130,170,0.45)" stroke-width="1"/>
  <path d="M16,91 L40,91 M60,91 L84,91" fill="none" stroke="rgba(120,200,230,0.45)" stroke-width="1.5"/>
</svg>`

export function createCockpitFrameOverlay(viewHudOverlay: HTMLElement): CockpitFrameOverlay {
  const cockpitFrameElement = document.createElement('div')
  cockpitFrameElement.className = 'cockpitFrameOverlay'
  cockpitFrameElement.innerHTML = COCKPIT_FRAME_SVG_MARKUP
  viewHudOverlay.appendChild(cockpitFrameElement)

  return {
    setCockpitFrameVisible(visible: boolean): void {
      cockpitFrameElement.classList.toggle('cockpitFrameOverlayVisible', visible)
    },
  }
}
