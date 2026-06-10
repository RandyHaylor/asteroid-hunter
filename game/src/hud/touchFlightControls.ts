import type { ShipFlightControlInput } from '../gameSimulation/newtonianShipPhysics'

// D5: on-screen rotation joystick (right side) + fixed movable throttle lever (left side, plane/boat style).
// A3: desktop parity — keyboard WASD/arrows rotate, Shift/Ctrl step the throttle; mouse drags the widgets.
// The lower third of the screen stays reserved for the fire zones (R11, built in the weapons task).

export type TouchFlightControls = {
  readFlightControlInput(): ShipFlightControlInput
  /** D14: tapping an asteroid for cover zeroes the throttle; moving it again escapes cover */
  setThrottleFraction(newThrottleFraction: number): void
}

export function createTouchFlightControls(hudOverlayRoot: HTMLElement): TouchFlightControls {
  // ===== STEP 1: rotation joystick widget =====

  const rotationJoystickZone = document.createElement('div')
  rotationJoystickZone.className = 'rotationJoystickZone'
  const rotationJoystickKnob = document.createElement('div')
  rotationJoystickKnob.className = 'rotationJoystickKnob'
  rotationJoystickZone.appendChild(rotationJoystickKnob)
  hudOverlayRoot.appendChild(rotationJoystickZone)

  const JOYSTICK_MAX_DEFLECTION_PIXELS = 48

  let joystickActivePointerId: number | null = null
  let joystickPitchInput = 0
  let joystickYawInput = 0

  function updateJoystickFromPointer(pointerEvent: PointerEvent): void {
    const zoneBounds = rotationJoystickZone.getBoundingClientRect()
    const zoneCenterX = zoneBounds.left + zoneBounds.width / 2
    const zoneCenterY = zoneBounds.top + zoneBounds.height / 2
    const rawDeflectionX = pointerEvent.clientX - zoneCenterX
    const rawDeflectionY = pointerEvent.clientY - zoneCenterY
    const clampedX = Math.max(-JOYSTICK_MAX_DEFLECTION_PIXELS, Math.min(JOYSTICK_MAX_DEFLECTION_PIXELS, rawDeflectionX))
    const clampedY = Math.max(-JOYSTICK_MAX_DEFLECTION_PIXELS, Math.min(JOYSTICK_MAX_DEFLECTION_PIXELS, rawDeflectionY))

    rotationJoystickKnob.style.transform = `translate(${clampedX}px, ${clampedY}px)`

    joystickYawInput = clampedX / JOYSTICK_MAX_DEFLECTION_PIXELS
    // dragging up (negative screen Y) pitches the nose up (arcade convention)
    joystickPitchInput = -clampedY / JOYSTICK_MAX_DEFLECTION_PIXELS
  }

  function releaseJoystick(): void {
    joystickActivePointerId = null
    joystickPitchInput = 0
    joystickYawInput = 0
    rotationJoystickKnob.style.transform = 'translate(0px, 0px)'
  }

  rotationJoystickZone.addEventListener('pointerdown', (pointerEvent) => {
    joystickActivePointerId = pointerEvent.pointerId
    rotationJoystickZone.setPointerCapture(pointerEvent.pointerId)
    updateJoystickFromPointer(pointerEvent)
  })
  rotationJoystickZone.addEventListener('pointermove', (pointerEvent) => {
    if (pointerEvent.pointerId === joystickActivePointerId) updateJoystickFromPointer(pointerEvent)
  })
  rotationJoystickZone.addEventListener('pointerup', releaseJoystick)
  rotationJoystickZone.addEventListener('pointercancel', releaseJoystick)

  // ===== STEP 2: throttle lever widget (stays where the player sets it) =====

  const throttleLeverTrack = document.createElement('div')
  throttleLeverTrack.className = 'throttleLeverTrack'
  const throttleLeverFill = document.createElement('div')
  throttleLeverFill.className = 'throttleLeverFill'
  const throttleLeverKnob = document.createElement('div')
  throttleLeverKnob.className = 'throttleLeverKnob'
  throttleLeverTrack.appendChild(throttleLeverFill)
  throttleLeverTrack.appendChild(throttleLeverKnob)
  hudOverlayRoot.appendChild(throttleLeverTrack)

  let throttleFraction = 0
  let throttleActivePointerId: number | null = null

  function renderThrottleLeverPosition(): void {
    const fillPercent = throttleFraction * 100
    throttleLeverFill.style.height = `${fillPercent}%`
    throttleLeverKnob.style.bottom = `calc(${fillPercent}% - 14px)`
  }
  renderThrottleLeverPosition()

  function updateThrottleFromPointer(pointerEvent: PointerEvent): void {
    const trackBounds = throttleLeverTrack.getBoundingClientRect()
    const fractionFromBottom = 1 - (pointerEvent.clientY - trackBounds.top) / trackBounds.height
    throttleFraction = Math.max(0, Math.min(1, fractionFromBottom))
    renderThrottleLeverPosition()
  }

  throttleLeverTrack.addEventListener('pointerdown', (pointerEvent) => {
    throttleActivePointerId = pointerEvent.pointerId
    throttleLeverTrack.setPointerCapture(pointerEvent.pointerId)
    updateThrottleFromPointer(pointerEvent)
  })
  throttleLeverTrack.addEventListener('pointermove', (pointerEvent) => {
    if (pointerEvent.pointerId === throttleActivePointerId) updateThrottleFromPointer(pointerEvent)
  })
  throttleLeverTrack.addEventListener('pointerup', () => {
    throttleActivePointerId = null
  })
  throttleLeverTrack.addEventListener('pointercancel', () => {
    throttleActivePointerId = null
  })

  // ===== STEP 3: keyboard fallback for desktop development (A3) =====

  const keysCurrentlyHeld = new Set<string>()
  const KEYBOARD_THROTTLE_STEP_PER_PRESS = 0.1

  window.addEventListener('keydown', (keyboardEvent) => {
    keysCurrentlyHeld.add(keyboardEvent.code)
    if (keyboardEvent.code === 'ShiftLeft' || keyboardEvent.code === 'ShiftRight') {
      throttleFraction = Math.min(1, throttleFraction + KEYBOARD_THROTTLE_STEP_PER_PRESS)
      renderThrottleLeverPosition()
    }
    if (keyboardEvent.code === 'ControlLeft' || keyboardEvent.code === 'ControlRight') {
      throttleFraction = Math.max(0, throttleFraction - KEYBOARD_THROTTLE_STEP_PER_PRESS)
      renderThrottleLeverPosition()
    }
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

  // ===== STEP 4: combined readout (joystick wins while it is being touched) =====

  return {
    readFlightControlInput(): ShipFlightControlInput {
      const joystickIsActive = joystickActivePointerId !== null
      return {
        pitchInput: joystickIsActive ? joystickPitchInput : readKeyboardPitchInput(),
        yawInput: joystickIsActive ? joystickYawInput : readKeyboardYawInput(),
        throttleFraction,
      }
    },
    setThrottleFraction(newThrottleFraction: number): void {
      throttleFraction = Math.max(0, Math.min(1, newThrottleFraction))
      renderThrottleLeverPosition()
    },
  }
}
