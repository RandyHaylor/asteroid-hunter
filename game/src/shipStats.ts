// Data-driven ship stats (R17/R18: upgrades later modify these values, systems read them every frame)

export type ShipFlightStats = {
  /** D54: the constant speed the ship always travels at (momentum never changes magnitude) */
  cruiseSpeedMetersPerSecond: number
  /** how fast the ship's facing rotates (radar drag-steer / keyboard) */
  maxTurnRateRadiansPerSecond: number
  /** D54: how fast holding thrust rotates the velocity VECTOR toward the facing (slow; upgradeable) */
  thrustTurnRateRadiansPerSecond: number
  // D52/D53: how fast the SHIP turns to aim ahead of a LOCKED enemy (lead-aim tracking), separate
  // from maxTurnRateRadiansPerSecond (the ship's own commanded-heading turn rate); upgradeable (R17).
  enemyTrackTurnRateRadiansPerSecond: number
}

export const playerShipBaseFlightStats: ShipFlightStats = {
  cruiseSpeedMetersPerSecond: 80,
  maxTurnRateRadiansPerSecond: 1.6,
  thrustTurnRateRadiansPerSecond: 0.6, // D54: ~⅓ of the facing turn rate — gently curves momentum toward the nose
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
