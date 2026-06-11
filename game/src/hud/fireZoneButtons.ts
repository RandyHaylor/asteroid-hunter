import './fireZoneButtons.css'

// R11: the lower third of the screen is fire input — left zone fires lasers,
// right zone fires missiles. Intent is "held", not "tapped": the flag stays true
// while the pointer is down so the game loop can gate fire rate by weapon cooldown.
// A3: desktop keyboard parity — Space holds laser fire, KeyX holds missile fire.

export type FireIntent = {
  wantsLaserFire: boolean
  wantsMissileFire: boolean
}

export type FireZoneButtons = {
  readFireIntent(): FireIntent
}

export function createFireZoneButtons(hudOverlayRoot: HTMLElement): FireZoneButtons {
  // ===== STEP 1: build the two translucent fire zone buttons (R11) =====

  // D35: fire buttons are positioned individually by orientation CSS — together in the bottom
  // margin (portrait) or split into the two side margins (landscape).
  const laserFireZoneButton = document.createElement('div')
  laserFireZoneButton.className = 'fireZoneButton fireZoneButtonLasers'
  laserFireZoneButton.textContent = 'LASERS'
  hudOverlayRoot.appendChild(laserFireZoneButton)

  const missileFireZoneButton = document.createElement('div')
  missileFireZoneButton.className = 'fireZoneButton fireZoneButtonMissiles'
  missileFireZoneButton.textContent = 'MISSILES'
  hudOverlayRoot.appendChild(missileFireZoneButton)

  // ===== STEP 2: pointer hold tracking per zone (same capture pattern as touchFlightControls) =====

  let laserZonePointerIsHeld = false
  let missileZonePointerIsHeld = false

  function wireFireZonePointerHold(
    fireZoneButton: HTMLElement,
    setZoneHeld: (zoneIsHeld: boolean) => void,
  ): void {
    let activePointerId: number | null = null

    fireZoneButton.addEventListener('pointerdown', (pointerEvent) => {
      activePointerId = pointerEvent.pointerId
      fireZoneButton.setPointerCapture(pointerEvent.pointerId)
      fireZoneButton.classList.add('fireZoneButtonHeld')
      setZoneHeld(true)
    })

    function releaseFireZone(pointerEvent: PointerEvent): void {
      if (pointerEvent.pointerId !== activePointerId) return
      activePointerId = null
      fireZoneButton.classList.remove('fireZoneButtonHeld')
      setZoneHeld(false)
    }
    fireZoneButton.addEventListener('pointerup', releaseFireZone)
    fireZoneButton.addEventListener('pointercancel', releaseFireZone)
  }

  wireFireZonePointerHold(laserFireZoneButton, (zoneIsHeld) => {
    laserZonePointerIsHeld = zoneIsHeld
  })
  wireFireZonePointerHold(missileFireZoneButton, (zoneIsHeld) => {
    missileZonePointerIsHeld = zoneIsHeld
  })

  // ===== STEP 3: keyboard parity — Space = laser held, KeyX = missile held (A3) =====

  const fireKeysCurrentlyHeld = new Set<string>()

  window.addEventListener('keydown', (keyboardEvent) => {
    if (keyboardEvent.code === 'Space' || keyboardEvent.code === 'KeyX') {
      fireKeysCurrentlyHeld.add(keyboardEvent.code)
    }
  })
  window.addEventListener('keyup', (keyboardEvent) => {
    fireKeysCurrentlyHeld.delete(keyboardEvent.code)
  })

  // ===== STEP 4: combined intent readout (pointer OR keyboard holds the trigger) =====

  return {
    readFireIntent(): FireIntent {
      return {
        wantsLaserFire: laserZonePointerIsHeld || fireKeysCurrentlyHeld.has('Space'),
        wantsMissileFire: missileZonePointerIsHeld || fireKeysCurrentlyHeld.has('KeyX'),
      }
    },
  }
}
