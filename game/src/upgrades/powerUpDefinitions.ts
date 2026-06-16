import { playerShipBaseFlightStats, playerShipBaseTractorBeamStats } from '../shipStats'
import { playerBaseLaserStats, playerBaseMissileStats } from '../weapons/weaponStats'

// D33: between-wave power-ups (finally implements R17/R18). Each definition mutates one of the
// live, data-driven stat singletons — the same objects every system already reads each frame — so
// picking an upgrade takes effect immediately and stacks across waves. No persistence (A4): the run
// resets on reload. The pure selectTwoDistinctPowerUps() picks the two offered choices.

export type PowerUpId =
  | 'speedBoost'
  | 'tractorDistance'
  | 'laserDamage'
  | 'missileDamage'
  | 'missileSpeed'
  | 'autoAimTrackingSpeed'
  | 'missileFireRate'
  | 'missileTrackingTurn'
  | 'shipTurnRate'

export type PowerUpDefinition = {
  powerUpId: PowerUpId
  displayName: string
  description: string
  /** inline SVG markup (24x24, stroke=currentColor) — unique per power-up */
  iconSvgMarkup: string
  /** mutate the relevant live stat singleton; called once when the player picks this power-up */
  applyToPlayerStats(): void
}

// each icon: 24x24 viewBox, no fill, stroke takes the card's currentColor
function iconSvg(innerMarkup: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${innerMarkup}</svg>`
}

export const ALL_POWER_UP_DEFINITIONS: readonly PowerUpDefinition[] = [
  {
    powerUpId: 'speedBoost',
    displayName: 'SPEED BOOST',
    description: '+18% top speed & thrust',
    // double chevron (fast-forward)
    iconSvgMarkup: iconSvg('<path d="M4 5l7 7-7 7"/><path d="M13 5l7 7-7 7"/>'),
    applyToPlayerStats(): void {
      playerShipBaseFlightStats.maxForwardSpeedMetersPerSecond *= 1.18
      playerShipBaseFlightStats.maxThrustNewtons *= 1.18
    },
  },
  {
    powerUpId: 'tractorDistance',
    displayName: 'TRACTOR RANGE',
    description: '+20% tractor grab distance',
    // anchor point + diverging beam with arrow
    iconSvgMarkup: iconSvg('<circle cx="4" cy="12" r="2"/><path d="M6 12h11"/><path d="M14 8l4 4-4 4"/>'),
    applyToPlayerStats(): void {
      playerShipBaseTractorBeamStats.tractorGrabMaxRangeMeters *= 1.2
    },
  },
  {
    powerUpId: 'laserDamage',
    displayName: 'LASER DAMAGE',
    description: '+30% laser bolt damage',
    // lightning bolt
    iconSvgMarkup: iconSvg('<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>'),
    applyToPlayerStats(): void {
      playerBaseLaserStats.boltDamage *= 1.3
    },
  },
  {
    powerUpId: 'missileDamage',
    displayName: 'MISSILE DAMAGE',
    description: '+30% missile explosion damage',
    // starburst blast
    iconSvgMarkup: iconSvg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
    applyToPlayerStats(): void {
      playerBaseMissileStats.explosionDamage *= 1.3
    },
  },
  {
    powerUpId: 'missileSpeed',
    displayName: 'MISSILE SPEED',
    description: '+25% missile flight speed',
    // rocket with motion lines
    iconSvgMarkup: iconSvg('<path d="M14 4c3 1 5 4 5 7l-4 4c-3 0-6-2-7-5z"/><path d="M3 12h4M3 16h5M3 8h3"/>'),
    applyToPlayerStats(): void {
      playerBaseMissileStats.missileSpeedMetersPerSecond *= 1.25
    },
  },
  {
    powerUpId: 'autoAimTrackingSpeed',
    displayName: 'AUTO-AIM TRACKING',
    description: '+25% lock tracking speed',
    // target reticle
    iconSvgMarkup: iconSvg('<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="2"/>'),
    applyToPlayerStats(): void {
      playerShipBaseFlightStats.enemyTrackTurnRateRadiansPerSecond *= 1.25
    },
  },
  {
    powerUpId: 'missileFireRate',
    displayName: 'MISSILE RATE',
    description: '−20% missile cooldown',
    // stopwatch
    iconSvgMarkup: iconSvg('<circle cx="12" cy="13" r="8"/><path d="M12 13V9M9 2h6"/>'),
    applyToPlayerStats(): void {
      playerBaseMissileStats.fireCooldownSeconds *= 0.8
    },
  },
  {
    powerUpId: 'missileTrackingTurn',
    displayName: 'MISSILE TRACKING',
    description: '+50% missile homing turn rate',
    // curving arrow
    iconSvgMarkup: iconSvg('<path d="M5 19c0-8 6-12 13-12"/><path d="M14 3l4 4-4 4"/>'),
    applyToPlayerStats(): void {
      playerBaseMissileStats.homingTurnRateRadiansPerSecond *= 1.5
    },
  },
  {
    powerUpId: 'shipTurnRate',
    displayName: 'SHIP HANDLING',
    description: '+25% ship turn rate',
    // rotation / curved arrows
    iconSvgMarkup: iconSvg('<path d="M4 12a8 8 0 0 1 13-6"/><path d="M17 3v4h-4"/><path d="M20 12a8 8 0 0 1-13 6"/><path d="M7 21v-4h4"/>'),
    applyToPlayerStats(): void {
      playerShipBaseFlightStats.maxTurnRateRadiansPerSecond *= 1.25
    },
  },
]

/**
 * Pick two DISTINCT power-ups to offer. randomUnitFractionFn returns [0,1) (injected so this is
 * deterministic and unit-testable; main.ts passes Math.random).
 */
export function selectTwoDistinctPowerUps(
  allPowerUps: readonly PowerUpDefinition[],
  randomUnitFractionFn: () => number,
): [PowerUpDefinition, PowerUpDefinition] {
  if (allPowerUps.length < 2) {
    throw new Error('selectTwoDistinctPowerUps requires at least two power-ups to choose from')
  }
  const remainingPowerUps = allPowerUps.slice()
  const firstIndex = Math.floor(randomUnitFractionFn() * remainingPowerUps.length)
  const [firstPowerUp] = remainingPowerUps.splice(firstIndex, 1)
  const secondIndex = Math.floor(randomUnitFractionFn() * remainingPowerUps.length)
  const [secondPowerUp] = remainingPowerUps.splice(secondIndex, 1)
  return [firstPowerUp, secondPowerUp]
}
