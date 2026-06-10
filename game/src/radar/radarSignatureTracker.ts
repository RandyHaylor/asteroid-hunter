import { Vector3 } from 'three'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import { isLineOfSightBlockedByAsteroids } from '../gameSimulation/lineOfSightProbe'

// R13–R16: the radar keeps a per-enemy SIGNATURE (keyed by enemyShipId). A signature remembers
// where the enemy was last seen; losing detection turns its dot into a fading "last seen here"
// marker (R14), re-detection replaces the stale dot (R15), and destroying the enemy resolves
// (removes) the signature entirely (R16).
// Pure logic — time is always injected via nowSeconds, never read from Date.now().

export const RADAR_DETECTION_RANGE_METERS = 1200
export const LAST_SEEN_FADE_DURATION_SECONDS = 12
/** R16: a signature counts as "recently active" if seen within this window and not eliminated */
export const RECENT_ACTIVE_WINDOW_SECONDS = 45

export type RadarContactReading = {
  contactSignatureId: number
  /** D4: no friendlies spawn in v1, but the contact contract supports them for later */
  contactType: 'enemy' | 'friendly'
  contactState: 'visible' | 'lastSeenFading'
  positionMeters: Vector3
  /** 1 when visible; decays linearly to 0 over LAST_SEEN_FADE_DURATION_SECONDS while fading (R14) */
  fadeRemainingFraction: number
}

type RadarContactSignature = {
  /** owned reading object, mutated in place and reused every update (no per-frame allocation) */
  reading: RadarContactReading
  lastSeenAtSeconds: number
  wasDetectedThisUpdate: boolean
}

export type RadarSignatureTracker = {
  updateRadarContacts(
    enemyShips: readonly EnemyShip[],
    asteroids: readonly AsteroidBody[],
    playerPositionMeters: Vector3,
    nowSeconds: number,
  ): void
  getContactReadings(): readonly RadarContactReading[]
  getRecentActiveEnemyCount(): number
  hasUnresolvedEnemies(): boolean
}

export function createRadarSignatureTracker(): RadarSignatureTracker {
  const signaturesByEnemyShipId = new Map<number, RadarContactSignature>()
  const currentContactReadings: RadarContactReading[] = []
  let recentActiveEnemyCount = 0

  function updateRadarContacts(
    enemyShips: readonly EnemyShip[],
    asteroids: readonly AsteroidBody[],
    playerPositionMeters: Vector3,
    nowSeconds: number,
  ): void {
    // STEP 1: reset per-update detection marks
    for (const signature of signaturesByEnemyShipId.values()) {
      signature.wasDetectedThisUpdate = false
    }

    // STEP 2: detect enemies and refresh/spawn their signatures (R13)
    for (const enemyShip of enemyShips) {
      // destroyed enemies are eliminated — their signature is resolved and fully removed (R16)
      if (enemyShip.isDestroyed) {
        signaturesByEnemyShipId.delete(enemyShip.enemyShipId)
        continue
      }

      const isWithinDetectionRange =
        enemyShip.positionMeters.distanceTo(playerPositionMeters) <= RADAR_DETECTION_RANGE_METERS
      const isDetected =
        isWithinDetectionRange &&
        !isLineOfSightBlockedByAsteroids(playerPositionMeters, enemyShip.positionMeters, asteroids)
      if (!isDetected) continue // never-seen enemies leave no signature; known ones age in STEP 3

      let signature = signaturesByEnemyShipId.get(enemyShip.enemyShipId)
      if (!signature) {
        signature = {
          reading: {
            contactSignatureId: enemyShip.enemyShipId,
            contactType: 'enemy',
            contactState: 'visible',
            positionMeters: new Vector3(),
            fadeRemainingFraction: 1,
          },
          lastSeenAtSeconds: nowSeconds,
          wasDetectedThisUpdate: true,
        }
        signaturesByEnemyShipId.set(enemyShip.enemyShipId, signature)
      }
      // R15: re-detection replaces any stale fading dot with the live visible dot
      signature.wasDetectedThisUpdate = true
      signature.lastSeenAtSeconds = nowSeconds
      signature.reading.contactState = 'visible'
      signature.reading.fadeRemainingFraction = 1
      signature.reading.positionMeters.copy(enemyShip.positionMeters)
    }

    // STEP 3: age undetected signatures into "last seen" fades, prune the long-forgotten (R14, R16)
    for (const [enemyShipId, signature] of signaturesByEnemyShipId) {
      if (signature.wasDetectedThisUpdate) continue
      const secondsSinceLastSeen = nowSeconds - signature.lastSeenAtSeconds
      if (secondsSinceLastSeen > RECENT_ACTIVE_WINDOW_SECONDS) {
        // no longer "seen recently" — drops out of the active count without being eliminated
        signaturesByEnemyShipId.delete(enemyShipId)
        continue
      }
      // pinned at the last seen position; fade decays linearly to 0 over the fade duration (R14)
      signature.reading.contactState = 'lastSeenFading'
      signature.reading.fadeRemainingFraction = Math.max(
        0,
        1 - secondsSinceLastSeen / LAST_SEEN_FADE_DURATION_SECONDS,
      )
    }

    // STEP 4: rebuild the published readings — exactly one reading per signature, and a fully
    // faded dot disappears from the display while its signature stays counted (R14/R16)
    currentContactReadings.length = 0
    for (const signature of signaturesByEnemyShipId.values()) {
      if (signature.reading.fadeRemainingFraction > 0) {
        currentContactReadings.push(signature.reading)
      }
    }
    recentActiveEnemyCount = signaturesByEnemyShipId.size
  }

  function getContactReadings(): readonly RadarContactReading[] {
    return currentContactReadings
  }

  // R16: signatures seen within the recent window that have not been eliminated
  function getRecentActiveEnemyCount(): number {
    return recentActiveEnemyCount
  }

  // R16: drives the blinking red radar outline while any enemy remains unresolved
  function hasUnresolvedEnemies(): boolean {
    return recentActiveEnemyCount > 0
  }

  return { updateRadarContacts, getContactReadings, getRecentActiveEnemyCount, hasUnresolvedEnemies }
}
