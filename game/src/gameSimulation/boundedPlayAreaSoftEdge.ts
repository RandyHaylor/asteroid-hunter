import { Vector3 } from 'three'
import { PLAY_AREA_RADIUS_METERS } from '../asteroids/asteroidFieldSpawner'

// D62: bounded sphere play area with a FAR-ORBIT edge that KEEPS THE SHIP MOVING. Past the edge
// radius the ship's velocity DIRECTION is gently rotated toward the tangential (orbit) direction at a
// constant speed — so it curves into a far orbit around the field instead of being pushed back or
// slowed. There is no inward shove and no speed damp. The auto-steer is suppressed while the player
// is actively dragging the radar to steer; it resumes (gently) the moment they release.

/** the auto-steer engages outside this fraction of the play radius */
const EDGE_ORBIT_ONSET_RADIUS_FRACTION = 0.95
/** how fast the velocity vector is rotated toward the orbit tangent (radians/second) — gentle */
const EDGE_ORBIT_STEER_RATE_RADIANS_PER_SECOND = 0.5

const scratchRadialOutDirection = new Vector3()
const scratchTangentialTarget = new Vector3()
const scratchVelocityDirection = new Vector3()
const scratchSteerAxis = new Vector3()
const WORLD_UP = new Vector3(0, 1, 0)
const WORLD_RIGHT = new Vector3(1, 0, 0)

export function easeShipIntoFieldEdgeOrbit(
  positionMeters: Vector3,
  velocityMetersPerSecond: Vector3,
  deltaSeconds: number,
  isPlayerSteeringRadar: boolean,
): void {
  if (isPlayerSteeringRadar) return // the player is actively steering — don't fight them

  const distanceFromCentreMeters = positionMeters.length()
  const onsetRadiusMeters = PLAY_AREA_RADIUS_METERS * EDGE_ORBIT_ONSET_RADIUS_FRACTION
  if (distanceFromCentreMeters <= onsetRadiusMeters) return

  const currentSpeedMetersPerSecond = velocityMetersPerSecond.length()
  if (currentSpeedMetersPerSecond < 1e-4) return

  scratchRadialOutDirection.copy(positionMeters).divideScalar(distanceFromCentreMeters)
  const outwardSpeed = velocityMetersPerSecond.dot(scratchRadialOutDirection)
  if (outwardSpeed <= 0) return // already heading inward/tangential — let the player fly back in freely

  // target = the tangential part of the current velocity (drop the outward radial part). Steering
  // toward it removes the outward motion over time → a far orbit, WITHOUT changing speed.
  scratchTangentialTarget.copy(velocityMetersPerSecond).addScaledVector(scratchRadialOutDirection, -outwardSpeed)
  if (scratchTangentialTarget.lengthSq() < 1e-6) {
    // velocity is purely radial — pick any stable tangent so we still curve into an orbit
    scratchTangentialTarget.copy(scratchRadialOutDirection).cross(WORLD_UP)
    if (scratchTangentialTarget.lengthSq() < 1e-6) scratchTangentialTarget.copy(scratchRadialOutDirection).cross(WORLD_RIGHT)
  }
  scratchTangentialTarget.normalize()

  scratchVelocityDirection.copy(velocityMetersPerSecond).divideScalar(currentSpeedMetersPerSecond)
  const angleToTangentRadians = scratchVelocityDirection.angleTo(scratchTangentialTarget)
  if (angleToTangentRadians < 1e-5) return

  const steerStepRadians = Math.min(angleToTangentRadians, EDGE_ORBIT_STEER_RATE_RADIANS_PER_SECOND * deltaSeconds)
  scratchSteerAxis.crossVectors(scratchVelocityDirection, scratchTangentialTarget)
  if (scratchSteerAxis.lengthSq() < 1e-8) return
  scratchSteerAxis.normalize()
  scratchVelocityDirection.applyAxisAngle(scratchSteerAxis, steerStepRadians)
  // keep the SAME speed — only the direction changed
  velocityMetersPerSecond.copy(scratchVelocityDirection).multiplyScalar(currentSpeedMetersPerSecond)
}
