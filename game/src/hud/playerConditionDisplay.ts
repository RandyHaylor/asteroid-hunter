import './playerConditionDisplay.css'

// D7/D27: HUD readout of the player ship condition. D27 tucks the bars against the very top of
// the screen as one wide strip — cyan SHIELD on the LEFT half (drains leftward), amber HULL on the
// RIGHT half (drains rightward). Purely presentational: the game loop feeds it the 0..1 fractions
// from playerShipCondition each frame; no game state lives here.

export type PlayerConditionDisplay = {
  updatePlayerConditionDisplay(shieldFraction: number, hullFraction: number): void
}

function clampToUnitFraction(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function createPlayerConditionDisplay(hudOverlayRoot: HTMLElement): PlayerConditionDisplay {
  // ===== STEP 1: build the two labelled bars (SHIELD above HULL, D7) =====

  const playerConditionPanel = document.createElement('div')
  playerConditionPanel.className = 'playerConditionPanel'
  hudOverlayRoot.appendChild(playerConditionPanel)

  function buildConditionBar(labelText: string, sideClassName: string, fillClassName: string): {
    barTrack: HTMLDivElement
    barFill: HTMLDivElement
  } {
    const barRow = document.createElement('div')
    barRow.className = `playerConditionBarRow ${sideClassName}`

    const barLabel = document.createElement('div')
    barLabel.className = 'playerConditionBarLabel'
    barLabel.textContent = labelText

    const barTrack = document.createElement('div')
    barTrack.className = 'playerConditionBarTrack'
    const barFill = document.createElement('div')
    barFill.className = `playerConditionBarFill ${fillClassName}`
    barTrack.appendChild(barFill)

    barRow.appendChild(barLabel)
    barRow.appendChild(barTrack)
    playerConditionPanel.appendChild(barRow)
    return { barTrack, barFill }
  }

  const shieldBar = buildConditionBar('SHIELD', 'playerConditionSideLeft', 'playerConditionShieldFill')
  const hullBar = buildConditionBar('HULL', 'playerConditionSideRight', 'playerConditionHullFill')

  // ===== STEP 2: per-frame update — set fill widths, pulse the shield track red when down =====

  return {
    updatePlayerConditionDisplay(shieldFraction: number, hullFraction: number): void {
      const clampedShieldFraction = clampToUnitFraction(shieldFraction)
      const clampedHullFraction = clampToUnitFraction(hullFraction)

      shieldBar.barFill.style.width = `${clampedShieldFraction * 100}%`
      hullBar.barFill.style.width = `${clampedHullFraction * 100}%`

      // shield fully down → the empty track pulses faintly red to warn the player (D7)
      shieldBar.barTrack.classList.toggle('playerConditionShieldDownPulse', clampedShieldFraction <= 0)
    },
  }
}
