import { describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import { computeAutopilotIntent, createAutopilotIntent, type AutopilotContext } from './shipAutopilot'
import type { ShipAutopilotSettings } from './shipAutopilotSettings'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'

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
    fleeAfterAnyDamage: false,
    reEngageShieldFraction: 1,
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
    recentlyDamaged: false,
    engagementRangeMeters: 600,
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

  it('evades when the shield drops below the evasion threshold', () => {
    const enemy = makeEnemy(new Vector3(0, 0, -300))
    const intent = createAutopilotIntent()
    computeAutopilotIntent(baseContext({ enemyShips: [enemy], shieldFraction: 0.3 }), intent)
    expect(intent.isEvading).toBe(true)
    expect(intent.thrustActive).toBe(true)
  })

  it('evades on any damage when fleeAfterAnyDamage is set', () => {
    const enemy = makeEnemy(new Vector3(0, 0, -300))
    const intent = createAutopilotIntent()
    computeAutopilotIntent(
      baseContext({ enemyShips: [enemy], recentlyDamaged: true, settings: baseSettings({ fleeAfterAnyDamage: true }) }),
      intent,
    )
    expect(intent.isEvading).toBe(true)
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
