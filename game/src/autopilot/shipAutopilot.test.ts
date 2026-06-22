import { describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import { computeAutopilotIntent, createAutopilotIntent, type AutopilotContext } from './shipAutopilot'
import type { ShipAutopilotSettings } from './shipAutopilotSettings'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'

// D93: minimal asteroid for redirect-grapple tests — the autopilot only reads position/radius/isDestroyed
function makeAsteroid(positionMeters: Vector3, currentRadiusMeters = 30): AsteroidBody {
  return { positionMeters, currentRadiusMeters, isDestroyed: false } as unknown as AsteroidBody
}

let nextId = 1
function makeEnemy(positionMeters: Vector3, grappleStrength = 0): EnemyShip {
  return {
    enemyShipId: nextId++,
    behaviorTier: 'orbitStrafe',
    positionMeters,
    velocityMetersPerSecond: new Vector3(),
    orientation: new Quaternion(),
    shieldPointsRemaining: 40,
    hitPointsRemaining: 60,
    isDestroyed: false,
    renderObject: new Object3D(),
    grappleStrength,
    grappledAsteroid: null,
  }
}
function baseSettings(overrides: Partial<ShipAutopilotSettings> = {}): ShipAutopilotSettings {
  return {
    preferredApproachAngleDegrees: 90,
    preferredEngagementRangeMeters: 500,
    targetPriority: 'nearest',
    isolationWeight: 0.8,
    maxEnemiesInRangeBeforeFlee: 2,
    shieldFractionBeforeEvasion: 0.5,
    fleeAfterHullDamage: false,
    reEngageShieldFraction: 1,
    autoChoosesUpgrades: false,
    ...overrides,
  }
}
function baseContext(overrides: Partial<AutopilotContext> = {}): AutopilotContext {
  return {
    playerPositionMeters: new Vector3(0, 0, 0),
    playerVelocityMetersPerSecond: new Vector3(0, 0, -80),
    enemyShips: [],
    asteroids: [],
    shieldFraction: 1,
    recentlyTookHullDamage: false,
    engagementRangeMeters: 600,
    maxSpeedMetersPerSecond: 120,
    wasEvadingLastFrame: false,
    settings: baseSettings(),
    ...overrides,
  }
}

describe('computeAutopilotIntent', () => {
  it('engages a healthy enemy: aims at it, and within firing range coasts (no thrust) to strafe', () => {
    const enemy = makeEnemy(new Vector3(0, 0, -300)) // 300 m < preferredEngagementRange 500 → in firing range
    const intent = createAutopilotIntent()
    computeAutopilotIntent(baseContext({ enemyShips: [enemy] }), intent)
    expect(intent.isEvading).toBe(false)
    expect(intent.engagedEnemyShipId).toBe(enemy.enemyShipId)
    expect(intent.latchCommand).toBe('release')
    // aims straight at the enemy so it enters the nose-cone lock and auto-fires (heading ~ -Z)
    expect(intent.desiredHeadingDirectionWorld.z).toBeLessThan(-0.9)
    expect(intent.thrustActive).toBe(false) // in range → coast (momentum strafes past while firing)
  })

  it('thrusts to close when the target is beyond the preferred engagement range', () => {
    const enemy = makeEnemy(new Vector3(0, 0, -560)) // beyond preferred 500 but within engagement 600
    const intent = createAutopilotIntent()
    computeAutopilotIntent(baseContext({ enemyShips: [enemy] }), intent)
    expect(intent.isEvading).toBe(false)
    expect(intent.engagedEnemyShipId).toBe(enemy.enemyShipId)
    expect(intent.thrustActive).toBe(true) // closing the gap
  })

  it('D93: redirect-grapples (not thrust) for a big >30° turn at near-full speed with an asteroid in reach', () => {
    const enemyBehind = makeEnemy(new Vector3(0, 0, 300)) // behind the -Z travel → ~180° turn wanted
    const asteroidInReach = makeAsteroid(new Vector3(0, 0, 80)) // surface ~50m away, within reach
    const intent = createAutopilotIntent()
    computeAutopilotIntent(
      baseContext({
        playerVelocityMetersPerSecond: new Vector3(0, 0, -120), // full speed forward (-Z)
        enemyShips: [enemyBehind],
        asteroids: [asteroidInReach],
      }),
      intent,
    )
    expect(intent.latchCommand).toBe('latchForRedirect')
    expect(intent.thrustActive).toBe(false) // slingshot redirects instead of fighting momentum with thrust
  })

  it('D93: does NOT redirect-grapple below near-full speed — it thrusts up to speed first', () => {
    const enemyBehind = makeEnemy(new Vector3(0, 0, 300))
    const asteroidInReach = makeAsteroid(new Vector3(0, 0, 80))
    const intent = createAutopilotIntent()
    computeAutopilotIntent(
      baseContext({
        playerVelocityMetersPerSecond: new Vector3(0, 0, -40), // 40 < 0.85*120 → too slow to redirect-grapple
        enemyShips: [enemyBehind],
        asteroids: [asteroidInReach],
      }),
      intent,
    )
    expect(intent.latchCommand).not.toBe('latchForRedirect')
    expect(intent.thrustActive).toBe(true) // thrust to build speed / steer
  })

  it('D93: does NOT redirect-grapple for a big turn when no asteroid is in reach', () => {
    const enemyBehind = makeEnemy(new Vector3(0, 0, 300))
    const intent = createAutopilotIntent()
    computeAutopilotIntent(
      baseContext({
        playerVelocityMetersPerSecond: new Vector3(0, 0, -120),
        enemyShips: [enemyBehind],
        asteroids: [], // none in reach
      }),
      intent,
    )
    expect(intent.latchCommand).not.toBe('latchForRedirect')
  })

  it('evades when the shield drops below the evasion threshold', () => {
    const enemy = makeEnemy(new Vector3(0, 0, -300))
    const intent = createAutopilotIntent()
    computeAutopilotIntent(baseContext({ enemyShips: [enemy], shieldFraction: 0.3 }), intent)
    expect(intent.isEvading).toBe(true)
    expect(intent.thrustActive).toBe(true)
  })

  it('D126: evades on HULL damage when fleeAfterHullDamage is set', () => {
    const enemy = makeEnemy(new Vector3(0, 0, -300))
    const intent = createAutopilotIntent()
    computeAutopilotIntent(
      baseContext({
        enemyShips: [enemy],
        recentlyTookHullDamage: true,
        settings: baseSettings({ fleeAfterHullDamage: true }),
      }),
      intent,
    )
    expect(intent.isEvading).toBe(true)
  })

  it('D126: does NOT flee when fleeAfterHullDamage is set but no HULL damage was taken (shield-only hits)', () => {
    const enemy = makeEnemy(new Vector3(0, 0, -300))
    const intent = createAutopilotIntent()
    computeAutopilotIntent(
      baseContext({
        enemyShips: [enemy],
        recentlyTookHullDamage: false, // a shield-only hit never sets this (main.ts gates it on hull)
        shieldFraction: 0.8, // above the 0.5 evade-below threshold, so shieldLow doesn't trigger either
        settings: baseSettings({ fleeAfterHullDamage: true }),
      }),
      intent,
    )
    expect(intent.isEvading).toBe(false)
    expect(intent.engagedEnemyShipId).toBe(enemy.enemyShipId)
  })

  it('evades when swarmed beyond the in-range flee threshold', () => {
    const enemies = [
      makeEnemy(new Vector3(0, 0, -200)),
      makeEnemy(new Vector3(50, 0, -200)),
      makeEnemy(new Vector3(-50, 0, -200)),
    ]
    const intent = createAutopilotIntent()
    computeAutopilotIntent(baseContext({ enemyShips: enemies, settings: baseSettings({ maxEnemiesInRangeBeforeFlee: 2 }) }), intent)
    expect(intent.isEvading).toBe(true)
  })

  it('singles out the ISOLATED enemy over a crowded cluster (high isolation weight)', () => {
    // a lone enemy far to one side, vs a tight cluster of 3 on the other (closer)
    const isolated = makeEnemy(new Vector3(0, 0, -500))
    const cluster = [
      makeEnemy(new Vector3(300, 0, 0)),
      makeEnemy(new Vector3(320, 0, 0)),
      makeEnemy(new Vector3(340, 0, 0)),
    ]
    const intent = createAutopilotIntent()
    // maxEnemiesInRangeBeforeFlee high so it engages rather than flees; isolationWeight high
    computeAutopilotIntent(
      baseContext({
        enemyShips: [isolated, ...cluster],
        settings: baseSettings({ maxEnemiesInRangeBeforeFlee: 10, isolationWeight: 1, targetPriority: 'nearest' }),
      }),
      intent,
    )
    expect(intent.isEvading).toBe(false)
    expect(intent.engagedEnemyShipId).toBe(isolated.enemyShipId)
  })
})
