import './weaponCooldownIndicators.css'

// D47/D48: weapons are always on (auto-fire at a locked, visible target). Two TINY horizontal
// cooldown bars run along the bottom edge of the view (laser above missile) and fill left→right as
// each weapon recharges, glowing when ready. Purely presentational, not controls.

export type WeaponCooldownIndicators = {
  /** fractions 0..1: 1 = fully recharged / ready to fire, <1 = still cooling down */
  updateWeaponCooldownIndicators(laserReadyFraction: number, missileReadyFraction: number): void
}

function buildCooldownBar(panel: HTMLElement, weaponClassName: string): HTMLDivElement {
  const bar = document.createElement('div')
  bar.className = `weaponCooldownBar ${weaponClassName}`
  const fill = document.createElement('div')
  fill.className = 'weaponCooldownFill'
  bar.appendChild(fill)
  panel.appendChild(bar)
  return fill
}

export function createWeaponCooldownIndicators(viewHudOverlay: HTMLElement): WeaponCooldownIndicators {
  const cooldownPanel = document.createElement('div')
  cooldownPanel.className = 'weaponCooldownPanel'
  viewHudOverlay.appendChild(cooldownPanel)

  const laserFill = buildCooldownBar(cooldownPanel, 'weaponCooldownBarLaser')
  const missileFill = buildCooldownBar(cooldownPanel, 'weaponCooldownBarMissile')

  function applyReadyFraction(fillElement: HTMLDivElement, readyFraction: number): void {
    const clampedFraction = Math.max(0, Math.min(1, readyFraction))
    fillElement.style.width = `${clampedFraction * 100}%`
    fillElement.parentElement?.classList.toggle('weaponCooldownBarReady', clampedFraction >= 1)
  }

  return {
    updateWeaponCooldownIndicators(laserReadyFraction, missileReadyFraction): void {
      applyReadyFraction(laserFill, laserReadyFraction)
      applyReadyFraction(missileFill, missileReadyFraction)
    },
  }
}
