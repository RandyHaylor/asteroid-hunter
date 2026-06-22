// Data-driven ship stats (R17/R18: upgrades later modify these values, systems read them every frame)

export type ShipFlightStats = {
  /** D88: the ship's MAX speed — the cap on velocity magnitude. Velocity ranges 0..this; thrust can
   *  never push past it (was the D54 always-on constant speed; now it is a ceiling). Upgradeable. */
  cruiseSpeedMetersPerSecond: number
  /** the TOP speed the ship's facing can rotate at (radar drag-steer / keyboard) */
  maxTurnRateRadiansPerSecond: number
  /** D65: angular "turn power" — how fast the facing turn rate accelerates/decelerates (rad/s²), so the
   *  ship builds up and eases out of turns rather than snapping to a fixed rate; upgradeable */
  turnAccelerationRadiansPerSecondSquared: number
  /** D88: linear thrust acceleration along the facing (m/s²). Deliberately WEAK so momentum is
   *  expensive — losing speed takes a long time to rebuild, making grapple-slingshots the fast way to
   *  redirect. Holding thrust adds velocity toward the nose (gain speed if aligned with travel, lose
   *  speed if opposed); capped at cruiseSpeedMetersPerSecond. Upgradeable. */
  thrustAccelerationMetersPerSecondSquared: number
  // D52/D53: how fast the SHIP turns to aim ahead of a LOCKED enemy (lead-aim tracking), separate
  // from maxTurnRateRadiansPerSecond (the ship's own commanded-heading turn rate); upgradeable (R17).
  enemyTrackTurnRateRadiansPerSecond: number
}

export const playerShipBaseFlightStats: ShipFlightStats = {
  cruiseSpeedMetersPerSecond: 180, // D116: +30 from 150 — MAX (cap) speed
  maxTurnRateRadiansPerSecond: 1.6,
  turnAccelerationRadiansPerSecondSquared: 2.5, // D65: ramps the facing turn up to max in ~0.6 s, eases out on arrival
  thrustAccelerationMetersPerSecondSquared: 14, // D88: weak/gradual — 0→max (120) takes ~8.5 s of held thrust; reversing direction much longer (momentum is expensive)
  enemyTrackTurnRateRadiansPerSecond: 0.7, // D59: capped low to start so fast/close/crossing enemies outrun the lock (loses tracking) — upgradeable via AUTO-AIM TRACKING
}

export type TractorBeamStats = {
  /** peak acceleration the beam can impart while reeling the ship to cover (R17: upgradeable) */
  maxPullAccelerationMetersPerSecondSquared: number
  /** how hard the beam brakes the ship as it arrives at the cover point */
  arrivalDampingPerSecond: number
  /** D16: asteroids are only tappable within this distance of the player (later: upgrades raise it, ship damage lowers it) */
  tractorGrabMaxRangeMeters: number
}

export const playerShipBaseTractorBeamStats: TractorBeamStats = {
  maxPullAccelerationMetersPerSecondSquared: 140,
  arrivalDampingPerSecond: 4,
  tractorGrabMaxRangeMeters: 525, // D19: extended 50% from the original 350
}

// D67: a single combined "Radar + Weapon" engagement range. Within it the player can lock,
// auto-fire, and sees a full rotating target ring + condition bars on an enemy; beyond it an enemy
// is still always shown (a small static red ring) but cannot be locked/fired-on. Upgradeable via
// the combined RADAR+WEAPON RANGE power-up (mutates this live singleton, like all other stats).
export type PlayerEngagementRange = {
  combinedRadarWeaponRangeMeters: number
}
export const playerEngagementRange: PlayerEngagementRange = {
  combinedRadarWeaponRangeMeters: 600, // D67: base (chosen mid-value between old radar 1200 & laser 280)
}
