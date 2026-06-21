// D99: the ship STATUS EVENT LOG model (new-changes line 29). A running, append-only log of status
// messages (shield/hull damage, shield recharged, enemies spotted, enemy destroyed/locked, and laser
// "barrage" damage). Pure + state-isolated so it's unit-testable; the HUD reads it (display module) and
// the integration layer (main.ts) feeds it events. The log ALWAYS records (even in manual mode) — only
// its on-screen VISIBILITY differs by mode (handled by the display).

export type ShipStatusLogEntry = {
  /** monotonically increasing id (for stable keys / "is this newer than what I showed") */
  entryId: number
  message: string
  /** wall-or-sim clock seconds when it was logged (the display uses it for the manual 4s fade) */
  timestampSeconds: number
}

// A laser "barrage" is a run of successive enemy laser hits. It stays open while strikes keep arriving
// within the gap window; it COMPLETES (and is reported as one summary) once a gap longer than the
// window passes — i.e. "two or more shots' worth of time" with no hit. The window is just over twice
// the enemy laser charge interval, per the design.
export const BARRAGE_GAP_WINDOW_CHARGE_INTERVAL_MULTIPLIER = 2.2

export type ShipStatusEventLog = {
  /** append a plain status message; returns the new entry */
  logMessage(message: string, nowSeconds: number): ShipStatusLogEntry
  /** record one enemy laser hit on the player; aggregated into a barrage (no entry until it completes) */
  recordEnemyLaserStrike(shieldOrHullDamage: number, nowSeconds: number, laserChargeIntervalSeconds: number): void
  /** call every frame — flushes a completed barrage into the log as one summary message */
  flushCompletedBarrage(nowSeconds: number): void
  /** all entries oldest→newest (for the full scrollable wave log) */
  getAllEntries(): readonly ShipStatusLogEntry[]
  /** the most recent `count` entries oldest→newest (for the AI mini running log) */
  getRecentEntries(count: number): readonly ShipStatusLogEntry[]
  /** clear the log (e.g. at the start of a fresh wave/run) */
  clear(): void
}

export function createShipStatusEventLog(maxRetainedEntries = 200): ShipStatusEventLog {
  const entries: ShipStatusLogEntry[] = []
  let nextEntryId = 1

  // open-barrage accumulator
  let barrageIsOpen = false
  let barrageStrikeCount = 0
  let barrageTotalDamage = 0
  let barrageLastStrikeSeconds = 0
  let barrageGapWindowSeconds = 0

  function appendEntry(message: string, nowSeconds: number): ShipStatusLogEntry {
    const entry: ShipStatusLogEntry = { entryId: nextEntryId++, message, timestampSeconds: nowSeconds }
    entries.push(entry)
    if (entries.length > maxRetainedEntries) entries.splice(0, entries.length - maxRetainedEntries)
    return entry
  }

  function completeOpenBarrage(): void {
    if (!barrageIsOpen) return
    const strikeCount = barrageStrikeCount
    const totalDamage = Math.round(barrageTotalDamage)
    barrageIsOpen = false
    barrageStrikeCount = 0
    barrageTotalDamage = 0
    appendEntry(
      `Took ${totalDamage} shield damage from ${strikeCount} successive laser beam strike${strikeCount === 1 ? '' : 's'}`,
      barrageLastStrikeSeconds,
    )
  }

  return {
    logMessage(message, nowSeconds): ShipStatusLogEntry {
      return appendEntry(message, nowSeconds)
    },
    recordEnemyLaserStrike(shieldOrHullDamage, nowSeconds, laserChargeIntervalSeconds): void {
      const gapWindowSeconds = laserChargeIntervalSeconds * BARRAGE_GAP_WINDOW_CHARGE_INTERVAL_MULTIPLIER
      // if the previous barrage already lapsed (gap exceeded), flush it before starting a new one
      if (barrageIsOpen && nowSeconds - barrageLastStrikeSeconds > barrageGapWindowSeconds) {
        completeOpenBarrage()
      }
      if (!barrageIsOpen) {
        barrageIsOpen = true
        barrageStrikeCount = 0
        barrageTotalDamage = 0
      }
      barrageStrikeCount += 1
      barrageTotalDamage += shieldOrHullDamage
      barrageLastStrikeSeconds = nowSeconds
      barrageGapWindowSeconds = gapWindowSeconds
    },
    flushCompletedBarrage(nowSeconds): void {
      if (barrageIsOpen && nowSeconds - barrageLastStrikeSeconds > barrageGapWindowSeconds) {
        completeOpenBarrage()
      }
    },
    getAllEntries(): readonly ShipStatusLogEntry[] {
      return entries
    },
    getRecentEntries(count): readonly ShipStatusLogEntry[] {
      return entries.slice(Math.max(0, entries.length - count))
    },
    clear(): void {
      entries.length = 0
      barrageIsOpen = false
      barrageStrikeCount = 0
      barrageTotalDamage = 0
    },
  }
}
