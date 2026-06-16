// Data-driven ship stats (R17/R18: upgrades later modify these values, systems read them every frame)

export type ShipFlightStats = {
  shipMassKg: number
  maxThrustNewtons: number
  maxTurnRateRadiansPerSecond: number
  maxForwardSpeedMetersPerSecond: number
  // D52/D53: how fast the SHIP turns to aim ahead of a LOCKED enemy (lead-aim tracking), separate
  // from maxTurnRateRadiansPerSecond (the ship's own commanded-heading turn rate); upgradeable (R17).
  enemyTrackTurnRateRadiansPerSecond: number
}

export const playerShipBaseFlightStats: ShipFlightStats = {
  shipMassKg: 1000,
  maxThrustNewtons: 60_000, // 60 m/s^2 peak acceleration
  maxTurnRateRadiansPerSecond: 1.6,
  maxForwardSpeedMetersPerSecond: 80,
  enemyTrackTurnRateRadiansPerSecond: 1.2, // D52: a bit slower than the ship's 1.6 turn rate so it can't fully keep up with a close, fast-crossing enemy
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
