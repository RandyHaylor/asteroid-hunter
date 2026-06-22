import './grappleControlButton.css'

// D117: a round GRAPPLE control button in the radar square's bottom-left corner (where the AI button
// used to sit). It mirrors the currently grappled asteroid (or, idle, previews the nearest grappleable
// one) by taking that rock's distance color, and becomes the RELEASE button while grappling. The
// arm/lock logic lives in main.ts (it owns the grapple controller + asteroid list); this is the view.

export type GrappleControlButtonState = 'idle' | 'preview' | 'armed' | 'grappling'

export type GrappleControlButton = {
  /** drive the button's look each frame. colorHsl = the target rock's color (null → no color/grey). */
  setVisualState(state: GrappleControlButtonState, colorHsl: string | null): void
  /** disable interaction (e.g. in AI mode the autopilot drives grappling), while still showing state */
  setInteractive(isInteractive: boolean): void
}

// D117: reports raw press/release (mirroring the rim icons' tap-vs-hold). main.ts routes these through
// the grapple controller — tap = commit orbit / tap-again = release / hold = orbit-while-held — and
// handles the "grey" arm + hold-to-cancel-arm cases.
export function createGrappleControlButton(
  parentElement: HTMLElement,
  onPress: () => void,
  onRelease: () => void,
): GrappleControlButton {
  const button = document.createElement('button')
  button.className = 'grappleControlButton'
  button.textContent = 'GRAPPLE'
  button.addEventListener('pointerdown', (pointerEvent) => {
    if (button.disabled) return
    pointerEvent.stopPropagation()
    button.setPointerCapture(pointerEvent.pointerId)
    onPress()
  })
  const handleRelease = (): void => {
    if (button.disabled) return
    onRelease()
  }
  button.addEventListener('pointerup', handleRelease)
  button.addEventListener('pointercancel', handleRelease)
  parentElement.appendChild(button)

  return {
    setVisualState(state, colorHsl): void {
      button.textContent = state === 'grappling' ? 'RELEASE' : 'GRAPPLE'
      button.style.setProperty('--grapple-button-color', colorHsl ?? '#888888')
      // colored (filled with the rock's color) while previewing a target or actively grappling it
      button.classList.toggle('grappleControlButtonColored', colorHsl !== null && (state === 'preview' || state === 'grappling'))
      button.classList.toggle('grappleControlButtonEngaged', state === 'grappling')
      button.classList.toggle('grappleControlButtonArmed', state === 'armed')
    },
    setInteractive(isInteractive): void {
      button.disabled = !isInteractive
    },
  }
}
