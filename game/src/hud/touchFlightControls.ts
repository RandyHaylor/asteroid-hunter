import type { ShipFlightControlInput } from '../gameSimulation/newtonianShipPhysics'

// D54: flight is momentum-based. The only controls are (1) radar drag-steer for the ship's FACING
// (handled in radarSphereDisplay) and (2) a single hold-to-THRUST button (this file) that, while
// held, curves the ship's velocity toward its facing. Desktop parity (A3): WASD/arrows rotate the
// facing; holding Shift or Space thrusts.

export type TouchFlightControls = {
  readFlightControlInput(): ShipFlightControlInput
  /** D54: true while the thrust button (touch) or a thrust key (Shift/Space) is held */
  isThrustActive(): boolean
}

export function createTouchFlightControls(leftControlCluster: HTMLElement): TouchFlightControls {
  // ===== STEP 1: hold-to-thrust button (left cluster, bottom-left relative to the radar) =====

  const thrustButton = document.createElement('button')
  thrustButton.className = 'thrustButton'
  thrustButton.textContent = 'THRUST'
  thrustButton.setAttribute('aria-pressed', 'false')
  leftControlCluster.appendChild(thrustButton)

  let thrustButtonHeld = false
  function setThrustButtonPressed(pressed: boolean): void {
    thrustButtonHeld = pressed
    thrustButton.classList.toggle('thrustButtonActive', pressed)
    thrustButton.setAttribute('aria-pressed', pressed ? 'true' : 'false')
  }
  thrustButton.addEventListener('pointerdown', (pointerEvent) => {
    thrustButton.setPointerCapture(pointerEvent.pointerId)
    setThrustButtonPressed(true)
  })
  thrustButton.addEventListener('pointerup', () => setThrustButtonPressed(false))
  thrustButton.addEventListener('pointercancel', () => setThrustButtonPressed(false))

  // ===== STEP 2: keyboard fallback for desktop development (A3) =====

  const keysCurrentlyHeld = new Set<string>()
  window.addEventListener('keydown', (keyboardEvent) => {
    keysCurrentlyHeld.add(keyboardEvent.code)
  })
  window.addEventListener('keyup', (keyboardEvent) => {
    keysCurrentlyHeld.delete(keyboardEvent.code)
  })

  function readKeyboardPitchInput(): number {
    let pitchInput = 0
    if (keysCurrentlyHeld.has('KeyW') || keysCurrentlyHeld.has('ArrowUp')) pitchInput += 1
    if (keysCurrentlyHeld.has('KeyS') || keysCurrentlyHeld.has('ArrowDown')) pitchInput -= 1
    return pitchInput
  }

  function readKeyboardYawInput(): number {
    let yawInput = 0
    if (keysCurrentlyHeld.has('KeyD') || keysCurrentlyHeld.has('ArrowRight')) yawInput += 1
    if (keysCurrentlyHeld.has('KeyA') || keysCurrentlyHeld.has('ArrowLeft')) yawInput -= 1
    return yawInput
  }

  function isThrustKeyHeld(): boolean {
    return (
      keysCurrentlyHeld.has('ShiftLeft') ||
      keysCurrentlyHeld.has('ShiftRight') ||
      keysCurrentlyHeld.has('Space')
    )
  }

  // ===== STEP 3: combined readouts =====

  function isThrustActive(): boolean {
    return thrustButtonHeld || isThrustKeyHeld()
  }

  return {
    // D40/D54: touch steering comes from the radar drag (merged in main.ts); here pitch/yaw are the
    // keyboard fallback only (A3). thrustActive is the hold-to-thrust button or a thrust key.
    readFlightControlInput(): ShipFlightControlInput {
      return {
        pitchInput: readKeyboardPitchInput(),
        yawInput: readKeyboardYawInput(),
        thrustActive: isThrustActive(),
      }
    },
    isThrustActive,
  }
}
