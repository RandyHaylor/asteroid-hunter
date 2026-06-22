// D74: tunable settings for the ship's AUTOPILOT ("AI mode"). A live singleton (like the stat blocks)
// the settings UI mutates and the autopilot reads each frame. Defaults are deliberately VERY
// CONSERVATIVE (survive-first, flee on any damage) so the player must tune them to find an effective
// balance — the tuning IS part of the gameplay.

export type AutopilotTargetPriority = 'nearest' | 'weakest' | 'mostDangerous'

export type ShipAutopilotSettings = {
  /** attack angle relative to the target's bearing (0 = head-on, 90 = flank). Higher = more circling. */
  preferredApproachAngleDegrees: number
  /** distance the autopilot tries to hold from its engaged target */
  preferredEngagementRangeMeters: number
  /** how it ranks which enemy to attack */
  targetPriority: AutopilotTargetPriority
  /** 0..1 — how strongly it favors an ISOLATED target (few other enemies nearby) so it fights 1–2 at a
   *  time, using the asteroid field to single them out. Higher = pickier about isolation. */
  isolationWeight: number
  /** flee/reposition once MORE than this many enemies are within engagement range (avoid being swarmed) */
  maxEnemiesInRangeBeforeFlee: number
  /** drop below this shield fraction → evade (orbit the nearest asteroid if one is in reach) */
  shieldFractionBeforeEvasion: number
  /** D126: HULL damage (a hit that bleeds past the shield into the hull) → break off and evade, then
   *  recover to reEngageShieldFraction before re-engaging. Shield-only hits don't trigger this (that's
   *  what shieldFractionBeforeEvasion is for) — so it isn't redundant with the shield settings. */
  fleeAfterHullDamage: boolean
  /** while evading, only resume attacking once the shield has recovered to at least this fraction.
   *  D126: also the recovery target for fleeAfterHullDamage (no separate after-hull level). */
  reEngageShieldFraction: number
  /** D92: when true, the between-wave upgrade is auto-picked (random) after a brief flash instead of
   *  waiting for the player to tap. Default OFF. */
  autoChoosesUpgrades: boolean
}

// VERY CONSERVATIVE defaults: barely engages, flees on any hit — the player tunes toward effectiveness.
export const shipAutopilotSettings: ShipAutopilotSettings = {
  preferredApproachAngleDegrees: 60, // D123: a closing flank (was 90 = perpendicular, which skirted enemies
  //                                     at max range and never attacked); 60° drives the default AI in to fight
  preferredEngagementRangeMeters: 520, // stay far
  targetPriority: 'nearest',
  isolationWeight: 0.8, // strongly prefer singling out 1–2
  maxEnemiesInRangeBeforeFlee: 2, // flee if more than two are in range
  shieldFractionBeforeEvasion: 0.9, // evade at the first dent in the shield
  fleeAfterHullDamage: true, // D126: break off when a hit reaches the HULL (not on shield-only hits)
  reEngageShieldFraction: 1, // only re-engage at full shield
  autoChoosesUpgrades: false, // D92: default OFF — player picks upgrades unless they enable auto-pick
}
