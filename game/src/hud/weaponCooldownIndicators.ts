import './weaponCooldownIndicators.css'

// D47: weapons are always on (auto-fire at a locked, visible target). These two TINY on-screen
// indicators (not controls) show each weapon's cooldown recharge — they fill bottom→up as the
// weapon recharges and glow when ready. Purely presentational.

export type WeaponCooldownIndicators = {
  /** fractions 0..1: 1 = fully recharged / ready to fire, <1 = still cooling down */
  updateWeaponCooldownIndicators(laserReadyFraction: number, missileReadyFraction: number): void
}

function buildCooldownPip(panel: HTMLElement, label: string, weaponClassName: string): HTMLDivElement {
  const pip = document.createElement('div')
  pip.className = `weaponCooldownPip ${weaponClassName}`
  const fill = document.createElement('div')
  fill.className = 'weaponCooldownFill'
  const labelElement = document.createElement('div')
  labelElement.className = 'weaponCooldownLabel'
  labelElement.textContent = label
  pip.appendChild(fill)
  pip.appendChild(labelElement)
  panel.appendChild(pip)
  return fill
}

export function createWeaponCooldownIndicators(viewHudOverlay: HTMLElement): WeaponCooldownIndicators {
  const cooldownPanel = document.createElement('div')
  cooldownPanel.className = 'weaponCooldownPanel'
  viewHudOverlay.appendChild(cooldownPanel)

  const laserFill = buildCooldownPip(cooldownPanel, 'L', 'weaponCooldownPipLaser')
  const missileFill = buildCooldownPip(cooldownPanel, 'M', 'weaponCooldownPipMissile')

  function applyReadyFraction(fillElement: HTMLDivElement, readyFraction: number): void {
    const clampedFraction = Math.max(0, Math.min(1, readyFraction))
    fillElement.style.height = `${clampedFraction * 100}%`
    fillElement.parentElement?.classList.toggle('weaponCooldownPipReady', clampedFraction >= 1)
  }

  return {
    updateWeaponCooldownIndicators(laserReadyFraction, missileReadyFraction): void {
      applyReadyFraction(laserFill, laserReadyFraction)
      applyReadyFraction(missileFill, missileReadyFraction)
    },
  }
}
