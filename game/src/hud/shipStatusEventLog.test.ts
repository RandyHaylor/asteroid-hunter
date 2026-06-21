import { describe, expect, it } from 'vitest'
import { createShipStatusEventLog } from './shipStatusEventLog'

const LASER_CHARGE_INTERVAL_SECONDS = 0.5
// the barrage gap window is 2.2 × the charge interval (≈ 1.1s for a 0.5s interval)
const WITHIN_BARRAGE_GAP_SECONDS = 0.6 // < 1.1 → same barrage
const BEYOND_BARRAGE_GAP_SECONDS = 1.3 // > 1.1 → barrage ended

describe('createShipStatusEventLog', () => {
  it('logs plain messages oldest→newest and exposes recent N', () => {
    const log = createShipStatusEventLog()
    log.logMessage('a', 0)
    log.logMessage('b', 1)
    log.logMessage('c', 2)
    expect(log.getAllEntries().map((e) => e.message)).toEqual(['a', 'b', 'c'])
    expect(log.getRecentEntries(2).map((e) => e.message)).toEqual(['b', 'c'])
  })

  it('aggregates successive laser strikes into ONE barrage summary once the gap lapses', () => {
    const log = createShipStatusEventLog()
    let nowSeconds = 0
    log.recordEnemyLaserStrike(5, nowSeconds, LASER_CHARGE_INTERVAL_SECONDS)
    nowSeconds += WITHIN_BARRAGE_GAP_SECONDS
    log.recordEnemyLaserStrike(5, nowSeconds, LASER_CHARGE_INTERVAL_SECONDS)
    nowSeconds += WITHIN_BARRAGE_GAP_SECONDS
    log.recordEnemyLaserStrike(5, nowSeconds, LASER_CHARGE_INTERVAL_SECONDS)
    // still open — nothing logged yet
    expect(log.getAllEntries().length).toBe(0)
    // gap lapses → flush completes the barrage as a single summary of all 3 strikes
    log.flushCompletedBarrage(nowSeconds + BEYOND_BARRAGE_GAP_SECONDS)
    const entries = log.getAllEntries()
    expect(entries.length).toBe(1)
    expect(entries[0].message).toBe('Took 15 shield damage from 3 successive laser beam strikes')
  })

  it('starts a NEW barrage after a gap (two separate summaries)', () => {
    const log = createShipStatusEventLog()
    log.recordEnemyLaserStrike(4, 0, LASER_CHARGE_INTERVAL_SECONDS)
    log.recordEnemyLaserStrike(4, WITHIN_BARRAGE_GAP_SECONDS, LASER_CHARGE_INTERVAL_SECONDS)
    // a far-later strike: the prior barrage flushes, a new one opens
    const farLaterSeconds = WITHIN_BARRAGE_GAP_SECONDS + BEYOND_BARRAGE_GAP_SECONDS
    log.recordEnemyLaserStrike(7, farLaterSeconds, LASER_CHARGE_INTERVAL_SECONDS)
    log.flushCompletedBarrage(farLaterSeconds + BEYOND_BARRAGE_GAP_SECONDS)
    const messages = log.getAllEntries().map((e) => e.message)
    expect(messages).toEqual([
      'Took 8 shield damage from 2 successive laser beam strikes',
      'Took 7 shield damage from 1 successive laser beam strike',
    ])
  })

  it('clear() empties the log and any open barrage', () => {
    const log = createShipStatusEventLog()
    log.logMessage('x', 0)
    log.recordEnemyLaserStrike(5, 0, LASER_CHARGE_INTERVAL_SECONDS)
    log.clear()
    log.flushCompletedBarrage(10)
    expect(log.getAllEntries().length).toBe(0)
  })
})
