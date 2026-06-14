import './fireZoneButtons.css'

// R11 + D45: LASERS / MISSILES are now TOGGLES (armed on/off), not hold-to-fire. While a weapon is
// armed, the game loop auto-fires it whenever an enemy is targeted (nose-cone lock) AND visible
// (clear line of sight), gated by the weapon's cooldown. readFireIntent() reports the armed state.
// A3: desktop keyboard parity — Space toggles lasers, KeyX toggles missiles (one toggle per press).

export type FireIntent = {
  /** weapon is ARMED — auto-fire when a visible target is locked */
  wantsLaserFire: boolean
  wantsMissileFire: boolean
}

export type FireZoneButtons = {
  readFireIntent(): FireIntent
}

// D37: LASERS button lives in the LEFT control cluster, MISSILES in the RIGHT cluster (R11).
export function createFireZoneButtons(
  leftControlCluster: HTMLElement,
  rightControlCluster: HTMLElement,
): FireZoneButtons {
  const laserFireZoneButton = document.createElement('div')
  laserFireZoneButton.className = 'fireZoneButton fireZoneButtonLasers'
  leftControlCluster.appendChild(laserFireZoneButton)

  const missileFireZoneButton = document.createElement('div')
  missileFireZoneButton.className = 'fireZoneButton fireZoneButtonMissiles'
  rightControlCluster.appendChild(missileFireZoneButton)

  // ===== armed-toggle state =====
  let laserAutoFireArmed = false
  let missileAutoFireArmed = false

  function applyLaserArmedState(): void {
    laserFireZoneButton.textContent = laserAutoFireArmed ? 'LASERS ●' : 'LASERS'
    laserFireZoneButton.classList.toggle('fireZoneButtonArmed', laserAutoFireArmed)
  }
  function applyMissileArmedState(): void {
    missileFireZoneButton.textContent = missileAutoFireArmed ? 'MISSILES ●' : 'MISSILES'
    missileFireZoneButton.classList.toggle('fireZoneButtonArmed', missileAutoFireArmed)
  }
  applyLaserArmedState()
  applyMissileArmedState()

  // tap toggles (let the event bubble so the first-gesture audio-resume listener still fires)
  laserFireZoneButton.addEventListener('pointerdown', () => {
    laserAutoFireArmed = !laserAutoFireArmed
    applyLaserArmedState()
  })
  missileFireZoneButton.addEventListener('pointerdown', () => {
    missileAutoFireArmed = !missileAutoFireArmed
    applyMissileArmedState()
  })

  // ===== keyboard parity (A3): one toggle per physical press (ignore auto-repeat) =====
  const fireToggleKeysCurrentlyHeld = new Set<string>()
  window.addEventListener('keydown', (keyboardEvent) => {
    if (keyboardEvent.code === 'Space' && !fireToggleKeysCurrentlyHeld.has('Space')) {
      fireToggleKeysCurrentlyHeld.add('Space')
      laserAutoFireArmed = !laserAutoFireArmed
      applyLaserArmedState()
    }
    if (keyboardEvent.code === 'KeyX' && !fireToggleKeysCurrentlyHeld.has('KeyX')) {
      fireToggleKeysCurrentlyHeld.add('KeyX')
      missileAutoFireArmed = !missileAutoFireArmed
      applyMissileArmedState()
    }
  })
  window.addEventListener('keyup', (keyboardEvent) => {
    fireToggleKeysCurrentlyHeld.delete(keyboardEvent.code)
  })

  return {
    readFireIntent(): FireIntent {
      return { wantsLaserFire: laserAutoFireArmed, wantsMissileFire: missileAutoFireArmed }
    },
  }
}
