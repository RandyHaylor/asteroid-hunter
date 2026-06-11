import type { ShipFlightControlInput } from '../gameSimulation/newtonianShipPhysics'

// D5: on-screen rotation joystick (right side) + fixed movable throttle lever (left side, plane/boat style).
// D18: a second strafe joystick sits just inside the throttle and appears only while tractored to an
// asteroid — it slides the ship around the cover shell while the rotation joystick keeps aiming the ship.
// A3: desktop parity — WASD/arrows rotate, Shift/Ctrl step the throttle, IJKL strafe in cover.
// The lower third of the screen stays reserved for the fire zones (R11).

export type StrafeControlInput = {
  /** -1..1, positive slides the ship toward its right around the cover shell */
  strafeXInput: number
  /** -1..1, positive slides the ship upward around the cover shell */
  strafeYInput: number
}

export type TouchFlightControls = {
  readFlightControlInput(): ShipFlightControlInput
  readStrafeControlInput(): StrafeControlInput
  /** D18: the strafe joystick only shows while the ship is held on a cover shell */
  setStrafeJoystickVisible(strafeJoystickVisible: boolean): void
  /** D14: tapping an asteroid for cover zeroes the throttle; moving it again escapes cover */
  setThrottleFraction(newThrottleFraction: number): void
}

const JOYSTICK_MAX_DEFLECTION_PIXELS = 48

type JoystickWidget = {
  zoneElement: HTMLDivElement
  /** -1..1 each, screen convention: +x = dragged right, +y = dragged DOWN */
  getDeflectionX(): number
  getDeflectionY(): number
  isPointerActive(): boolean
}

function buildJoystickWidget(zoneClassName: string, knobClassName: string): JoystickWidget {
  const zoneElement = document.createElement('div')
  zoneElement.className = zoneClassName
  const knobElement = document.createElement('div')
  knobElement.className = knobClassName
  zoneElement.appendChild(knobElement)

  let activePointerId: number | null = null
  let deflectionX = 0
  let deflectionY = 0

  function updateDeflectionFromPointer(pointerEvent: PointerEvent): void {
    const zoneBounds = zoneElement.getBoundingClientRect()
    const zoneCenterX = zoneBounds.left + zoneBounds.width / 2
    const zoneCenterY = zoneBounds.top + zoneBounds.height / 2
    const clampedX = Math.max(
      -JOYSTICK_MAX_DEFLECTION_PIXELS,
      Math.min(JOYSTICK_MAX_DEFLECTION_PIXELS, pointerEvent.clientX - zoneCenterX),
    )
    const clampedY = Math.max(
      -JOYSTICK_MAX_DEFLECTION_PIXELS,
      Math.min(JOYSTICK_MAX_DEFLECTION_PIXELS, pointerEvent.clientY - zoneCenterY),
    )
    knobElement.style.transform = `translate(${clampedX}px, ${clampedY}px)`
    deflectionX = clampedX / JOYSTICK_MAX_DEFLECTION_PIXELS
    deflectionY = clampedY / JOYSTICK_MAX_DEFLECTION_PIXELS
  }

  function releaseJoystick(): void {
    activePointerId = null
    deflectionX = 0
    deflectionY = 0
    knobElement.style.transform = 'translate(0px, 0px)'
  }

  zoneElement.addEventListener('pointerdown', (pointerEvent) => {
    activePointerId = pointerEvent.pointerId
    zoneElement.setPointerCapture(pointerEvent.pointerId)
    updateDeflectionFromPointer(pointerEvent)
  })
  zoneElement.addEventListener('pointermove', (pointerEvent) => {
    if (pointerEvent.pointerId === activePointerId) updateDeflectionFromPointer(pointerEvent)
  })
  zoneElement.addEventListener('pointerup', releaseJoystick)
  zoneElement.addEventListener('pointercancel', releaseJoystick)

  return {
    zoneElement,
    getDeflectionX: () => deflectionX,
    getDeflectionY: () => deflectionY,
    isPointerActive: () => activePointerId !== null,
  }
}

// D37: throttle + cover-strafe joystick live in the LEFT control cluster; the rotation joystick
// lives in the RIGHT control cluster. The clusters are flex columns (style.css) that resize their
// items so controls never overlap the screen or each other.
export function createTouchFlightControls(
  leftControlCluster: HTMLElement,
  rightControlCluster: HTMLElement,
): TouchFlightControls {
  // ===== STEP 1: rotation joystick (right cluster) + cover strafe joystick (left, hidden until tractored) =====

  const rotationJoystick = buildJoystickWidget('rotationJoystickZone', 'rotationJoystickKnob')
  rightControlCluster.appendChild(rotationJoystick.zoneElement)

  const strafeJoystick = buildJoystickWidget('strafeJoystickZone', 'strafeJoystickKnob')
  leftControlCluster.appendChild(strafeJoystick.zoneElement)

  // ===== STEP 2: throttle lever widget (left cluster) =====

  const throttleLeverTrack = document.createElement('div')
  throttleLeverTrack.className = 'throttleLeverTrack'
  const throttleLeverFill = document.createElement('div')
  throttleLeverFill.className = 'throttleLeverFill'
  const throttleLeverKnob = document.createElement('div')
  throttleLeverKnob.className = 'throttleLeverKnob'
  throttleLeverTrack.appendChild(throttleLeverFill)
  throttleLeverTrack.appendChild(throttleLeverKnob)
  leftControlCluster.appendChild(throttleLeverTrack)

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

  function readKeyboardStrafeXInput(): number {
    let strafeXInput = 0
    if (keysCurrentlyHeld.has('KeyL')) strafeXInput += 1
    if (keysCurrentlyHeld.has('KeyJ')) strafeXInput -= 1
    return strafeXInput
  }

  function readKeyboardStrafeYInput(): number {
    let strafeYInput = 0
    if (keysCurrentlyHeld.has('KeyI')) strafeYInput += 1
    if (keysCurrentlyHeld.has('KeyK')) strafeYInput -= 1
    return strafeYInput
  }

  // ===== STEP 4: combined readouts (a joystick wins while it is being touched) =====

  return {
    readFlightControlInput(): ShipFlightControlInput {
      const rotationJoystickIsActive = rotationJoystick.isPointerActive()
      return {
        // dragging up (negative screen Y) pitches the nose up (arcade convention)
        pitchInput: rotationJoystickIsActive ? -rotationJoystick.getDeflectionY() : readKeyboardPitchInput(),
        yawInput: rotationJoystickIsActive ? rotationJoystick.getDeflectionX() : readKeyboardYawInput(),
        throttleFraction,
      }
    },
    readStrafeControlInput(): StrafeControlInput {
      const strafeJoystickIsActive = strafeJoystick.isPointerActive()
      return {
        strafeXInput: strafeJoystickIsActive ? strafeJoystick.getDeflectionX() : readKeyboardStrafeXInput(),
        // dragging up slides the ship up around the shell
        strafeYInput: strafeJoystickIsActive ? -strafeJoystick.getDeflectionY() : readKeyboardStrafeYInput(),
      }
    },
    setStrafeJoystickVisible(strafeJoystickVisible: boolean): void {
      strafeJoystick.zoneElement.classList.toggle('strafeJoystickZoneVisible', strafeJoystickVisible)
    },
    setThrottleFraction(newThrottleFraction: number): void {
      throttleFraction = Math.max(0, Math.min(1, newThrottleFraction))
      renderThrottleLeverPosition()
    },
  }
}
