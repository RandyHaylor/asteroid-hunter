import { Vector3 } from 'three'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'
import { computeOrbitStep } from './computeOrbitStep'

// D60: the grapple/slingshot latch state machine. Interaction (per the design):
//  - tap an asteroid icon        → latch + orbit it (committed; orbit persists)
//  - tap the SAME icon again      → release
//  - tap-and-hold an icon >1s     → orbit only while held; release on lift
//  - tap a DIFFERENT icon         → switch the orbit to it instantly
// On latch we freeze the orbit plane (orbitAxis = radius × velocity) and the orbit radius. The ship's
// position/velocity are then driven along that circle each frame; releasing keeps the tangential
// velocity (a straight-line slingshot). The ship FACING and camera are unaffected (handled elsewhere).

const HOLD_TO_ORBIT_THRESHOLD_SECONDS = 1

const scratchRadiusVector = new Vector3()
const scratchOrbitAxis = new Vector3()
const WORLD_UP = new Vector3(0, 1, 0)
const WORLD_RIGHT = new Vector3(1, 0, 0)

export type GrappleOrbitController = {
  onAsteroidIconPressed(asteroid: AsteroidBody, shipState: ShipRigidBodyState, nowSeconds: number): void
  onAsteroidIconReleased(asteroid: AsteroidBody, nowSeconds: number): void
  isLatched(): boolean
  getLatchedAsteroidId(): number | null
  /** the asteroid currently orbited (for the tractor beam line + radar marker), or null */
  getLatchedAsteroid(): AsteroidBody | null
  /** drive the ship along the orbit this frame (call only when isLatched()) */
  stepOrbit(shipState: ShipRigidBodyState, cruiseSpeedMetersPerSecond: number, deltaSeconds: number): void
  releaseLatch(): void
}

export function createGrappleOrbitController(): GrappleOrbitController {
  let latchedAsteroid: AsteroidBody | null = null
  const orbitAxisUnit = new Vector3()
  let orbitRadiusMeters = 0
  let latchWasCommittedByTap = false
  let pressStartSeconds = 0
  let pressedAsteroidId: number | null = null

  function computeOrbitFrameFromShip(asteroid: AsteroidBody, shipState: ShipRigidBodyState): void {
    scratchRadiusVector.copy(shipState.positionMeters).sub(asteroid.positionMeters)
    orbitRadiusMeters = scratchRadiusVector.length()
    // orbit plane: perpendicular to (radius × velocity), so the orbit starts in the ship's current
    // direction of travel. Fall back to a stable axis if velocity is zero/parallel to the radius.
    scratchOrbitAxis.copy(scratchRadiusVector).cross(shipState.velocityMetersPerSecond)
    if (scratchOrbitAxis.lengthSq() < 1e-8) scratchOrbitAxis.copy(scratchRadiusVector).cross(WORLD_UP)
    if (scratchOrbitAxis.lengthSq() < 1e-8) scratchOrbitAxis.copy(scratchRadiusVector).cross(WORLD_RIGHT)
    orbitAxisUnit.copy(scratchOrbitAxis).normalize()
  }

  function latchTo(asteroid: AsteroidBody, shipState: ShipRigidBodyState): void {
    latchedAsteroid = asteroid
    computeOrbitFrameFromShip(asteroid, shipState)
  }

  function releaseLatch(): void {
    latchedAsteroid = null
    pressedAsteroidId = null
  }

  return {
    onAsteroidIconPressed(asteroid, shipState, nowSeconds): void {
      // tapping the already-committed asteroid again releases it
      if (latchedAsteroid === asteroid && latchWasCommittedByTap) {
        releaseLatch()
        return
      }
      // otherwise latch (or switch) to this asteroid and begin a press (pending tap/hold decision)
      latchTo(asteroid, shipState)
      latchWasCommittedByTap = false
      pressStartSeconds = nowSeconds
      pressedAsteroidId = asteroid.asteroidId
    },
    onAsteroidIconReleased(asteroid, nowSeconds): void {
      if (pressedAsteroidId !== asteroid.asteroidId) return
      pressedAsteroidId = null
      if (latchedAsteroid !== asteroid) return
      const heldSeconds = nowSeconds - pressStartSeconds
      if (heldSeconds > HOLD_TO_ORBIT_THRESHOLD_SECONDS) {
        releaseLatch() // hold-to-orbit: lifting ends the orbit
      } else {
        latchWasCommittedByTap = true // a tap commits the orbit until tapped again
      }
    },
    isLatched(): boolean {
      if (latchedAsteroid !== null && latchedAsteroid.isDestroyed) releaseLatch()
      return latchedAsteroid !== null
    },
    getLatchedAsteroidId(): number | null {
      return latchedAsteroid ? latchedAsteroid.asteroidId : null
    },
    getLatchedAsteroid(): AsteroidBody | null {
      return latchedAsteroid
    },
    stepOrbit(shipState, cruiseSpeedMetersPerSecond, deltaSeconds): void {
      if (latchedAsteroid === null) return
      computeOrbitStep(
        shipState.positionMeters,
        latchedAsteroid.positionMeters,
        orbitAxisUnit,
        orbitRadiusMeters,
        cruiseSpeedMetersPerSecond,
        deltaSeconds,
        shipState.positionMeters,
        shipState.velocityMetersPerSecond,
      )
    },
    releaseLatch,
  }
}
