import { describe, expect, it } from 'vitest'
import { Object3D, Quaternion, Vector3 } from 'three'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import {
  createRadarSignatureTracker,
  LAST_SEEN_FADE_DURATION_SECONDS,
  RADAR_DETECTION_RANGE_METERS,
  RECENT_ACTIVE_WINDOW_SECONDS,
} from './radarSignatureTracker'

const playerPositionAtOrigin = new Vector3(0, 0, 0)

function makeTestEnemyShip(enemyShipId: number, positionMeters: Vector3): EnemyShip {
  return {
    enemyShipId,
    behaviorTier: 'dumbPatrol',
    positionMeters: positionMeters.clone(),
    velocityMetersPerSecond: new Vector3(),
    orientation: new Quaternion(),
    shieldPointsRemaining: 40,
    hitPointsRemaining: 10,
    isDestroyed: false,
    renderObject: new Object3D(),
    grappleStrength: 0,
    grappledAsteroid: null,
  }
}

function makeObscuringAsteroidOnSightLine(
  asteroidId: number,
  positionMeters: Vector3,
  radiusMeters: number,
): AsteroidBody {
  return {
    asteroidId,
    sizeClass: 'large',
    positionMeters: positionMeters.clone(),
    velocityMetersPerSecond: new Vector3(),
    currentRadiusMeters: radiusMeters,
    massKg: 1_000_000,
    hitPointsRemaining: 100,
    isDestroyed: false,
    renderObject: new Object3D(),
  }
}

describe('createRadarSignatureTracker', () => {
  it('detects an alive in-range unobstructed enemy as a visible reading (R13)', () => {
    const radarTracker = createRadarSignatureTracker()
    const enemyShip = makeTestEnemyShip(7, new Vector3(0, 0, -500))

    radarTracker.updateRadarContacts([enemyShip], [], playerPositionAtOrigin, 0)

    const contactReadings = radarTracker.getContactReadings()
    expect(contactReadings).toHaveLength(1)
    expect(contactReadings[0].contactSignatureId).toBe(7)
    expect(contactReadings[0].contactType).toBe('enemy')
    expect(contactReadings[0].contactState).toBe('visible')
    expect(contactReadings[0].fadeRemainingFraction).toBe(1)
    expect(contactReadings[0].positionMeters.distanceTo(enemyShip.positionMeters)).toBeLessThan(1e-9)
    expect(radarTracker.getRecentActiveEnemyCount()).toBe(1)
    expect(radarTracker.hasUnresolvedEnemies()).toBe(true)
  })

  it('ignores enemies beyond the detection range and never creates a signature for them', () => {
    const radarTracker = createRadarSignatureTracker()
    const farEnemyShip = makeTestEnemyShip(1, new Vector3(0, 0, -(RADAR_DETECTION_RANGE_METERS + 50)))

    radarTracker.updateRadarContacts([farEnemyShip], [], playerPositionAtOrigin, 0)

    expect(radarTracker.getContactReadings()).toHaveLength(0)
    expect(radarTracker.getRecentActiveEnemyCount()).toBe(0)
    expect(radarTracker.hasUnresolvedEnemies()).toBe(false)
  })

  it('flips an obscured enemy to lastSeenFading pinned at the last seen position with a linear fade (R14)', () => {
    const radarTracker = createRadarSignatureTracker()
    const enemyShip = makeTestEnemyShip(3, new Vector3(0, 0, -500))
    const lastSeenPosition = enemyShip.positionMeters.clone()

    // seen clearly at t=0
    radarTracker.updateRadarContacts([enemyShip], [], playerPositionAtOrigin, 0)

    // an asteroid slides onto the sight line and the enemy keeps moving behind it
    const obscuringAsteroid = makeObscuringAsteroidOnSightLine(100, new Vector3(0, 0, -250), 40)
    enemyShip.positionMeters.set(10, 0, -520)

    radarTracker.updateRadarContacts([enemyShip], [obscuringAsteroid], playerPositionAtOrigin, 3)
    let contactReadings = radarTracker.getContactReadings()
    expect(contactReadings).toHaveLength(1)
    expect(contactReadings[0].contactState).toBe('lastSeenFading')
    // pinned where it was LAST seen, not where the enemy actually moved
    expect(contactReadings[0].positionMeters.distanceTo(lastSeenPosition)).toBeLessThan(1e-9)
    expect(contactReadings[0].fadeRemainingFraction).toBeCloseTo(1 - 3 / LAST_SEEN_FADE_DURATION_SECONDS, 10)

    // fade keeps decaying linearly as time advances
    radarTracker.updateRadarContacts([enemyShip], [obscuringAsteroid], playerPositionAtOrigin, 6)
    contactReadings = radarTracker.getContactReadings()
    expect(contactReadings).toHaveLength(1)
    expect(contactReadings[0].fadeRemainingFraction).toBeCloseTo(1 - 6 / LAST_SEEN_FADE_DURATION_SECONDS, 10)
    expect(radarTracker.hasUnresolvedEnemies()).toBe(true)
  })

  it('replaces the stale fading dot with a single visible dot when the enemy is re-detected (R15)', () => {
    const radarTracker = createRadarSignatureTracker()
    const enemyShip = makeTestEnemyShip(5, new Vector3(0, 0, -500))
    const obscuringAsteroid = makeObscuringAsteroidOnSightLine(101, new Vector3(0, 0, -250), 40)

    radarTracker.updateRadarContacts([enemyShip], [], playerPositionAtOrigin, 0)
    radarTracker.updateRadarContacts([enemyShip], [obscuringAsteroid], playerPositionAtOrigin, 4)
    expect(radarTracker.getContactReadings()[0].contactState).toBe('lastSeenFading')

    // the cover asteroid is destroyed — line of sight reopens and the enemy is re-detected
    obscuringAsteroid.isDestroyed = true
    enemyShip.positionMeters.set(80, 0, -450)
    radarTracker.updateRadarContacts([enemyShip], [obscuringAsteroid], playerPositionAtOrigin, 5)

    const contactReadings = radarTracker.getContactReadings()
    expect(contactReadings).toHaveLength(1) // exactly one reading per signature — never both dots
    expect(contactReadings[0].contactState).toBe('visible')
    expect(contactReadings[0].fadeRemainingFraction).toBe(1)
    expect(contactReadings[0].positionMeters.distanceTo(enemyShip.positionMeters)).toBeLessThan(1e-9)
  })

  it('removes the signature entirely when the enemy is destroyed, resolving it (R16)', () => {
    const radarTracker = createRadarSignatureTracker()
    const enemyShip = makeTestEnemyShip(9, new Vector3(0, 0, -400))

    radarTracker.updateRadarContacts([enemyShip], [], playerPositionAtOrigin, 0)
    expect(radarTracker.getRecentActiveEnemyCount()).toBe(1)

    enemyShip.isDestroyed = true
    radarTracker.updateRadarContacts([enemyShip], [], playerPositionAtOrigin, 1)

    expect(radarTracker.getContactReadings()).toHaveLength(0)
    expect(radarTracker.getRecentActiveEnemyCount()).toBe(0)
    expect(radarTracker.hasUnresolvedEnemies()).toBe(false)
  })

  it('keeps counting a fully faded but uneliminated enemy as recently active (R14/R16)', () => {
    const radarTracker = createRadarSignatureTracker()
    const enemyShip = makeTestEnemyShip(2, new Vector3(0, 0, -500))
    const obscuringAsteroid = makeObscuringAsteroidOnSightLine(102, new Vector3(0, 0, -250), 40)

    radarTracker.updateRadarContacts([enemyShip], [], playerPositionAtOrigin, 0)
    radarTracker.updateRadarContacts(
      [enemyShip],
      [obscuringAsteroid],
      playerPositionAtOrigin,
      LAST_SEEN_FADE_DURATION_SECONDS + 1,
    )

    // dot has fully faded off the display, but the enemy is still out there — count stays > 0
    expect(radarTracker.getContactReadings()).toHaveLength(0)
    expect(radarTracker.getRecentActiveEnemyCount()).toBe(1)
    expect(radarTracker.hasUnresolvedEnemies()).toBe(true)

    // once unseen for longer than the recent window, it drops out of the active count (R16)
    radarTracker.updateRadarContacts(
      [enemyShip],
      [obscuringAsteroid],
      playerPositionAtOrigin,
      RECENT_ACTIVE_WINDOW_SECONDS + 1,
    )
    expect(radarTracker.getRecentActiveEnemyCount()).toBe(0)
    expect(radarTracker.hasUnresolvedEnemies()).toBe(false)
  })

  it('tracks multiple enemies with independent signatures', () => {
    const radarTracker = createRadarSignatureTracker()
    const nearEnemyShip = makeTestEnemyShip(11, new Vector3(200, 0, -300))
    const hiddenEnemyShip = makeTestEnemyShip(12, new Vector3(0, 0, -500))
    const obscuringAsteroid = makeObscuringAsteroidOnSightLine(103, new Vector3(0, 0, -250), 40)

    radarTracker.updateRadarContacts([nearEnemyShip, hiddenEnemyShip], [], playerPositionAtOrigin, 0)
    radarTracker.updateRadarContacts(
      [nearEnemyShip, hiddenEnemyShip],
      [obscuringAsteroid],
      playerPositionAtOrigin,
      2,
    )

    const contactReadings = radarTracker.getContactReadings()
    expect(contactReadings).toHaveLength(2)
    const readingById = new Map(contactReadings.map((reading) => [reading.contactSignatureId, reading]))
    expect(readingById.get(11)?.contactState).toBe('visible')
    expect(readingById.get(12)?.contactState).toBe('lastSeenFading')
    expect(radarTracker.getRecentActiveEnemyCount()).toBe(2)
  })
})
