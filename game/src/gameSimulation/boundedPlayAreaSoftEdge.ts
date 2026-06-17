import { Vector3 } from 'three'
import { PLAY_AREA_RADIUS_METERS } from '../asteroids/asteroidFieldSpawner'

// D61: bounded sphere play area with a FAR-ORBIT edge. Instead of shoving the ship back toward the
// centre (the old turn-around the player never wanted), we simply stop it from leaving: near the
// boundary the OUTWARD radial part of the velocity is damped to zero and the ship is clamped onto the
// boundary sphere, so it eases into a tangential glide — a far orbit around the whole field. There is
// NO inward push, so the player keeps full control and can thrust back inward to re-enter the field.

/** start easing the outward motion away at this fraction of the play radius */
const EDGE_ORBIT_ONSET_RADIUS_FRACTION = 0.9

const scratchRadialOutDirection = new Vector3()

export function easeShipIntoFieldEdgeOrbit(
  positionMeters: Vector3,
  velocityMetersPerSecond: Vector3,
): void {
  const distanceFromCentreMeters = positionMeters.length()
  const onsetRadiusMeters = PLAY_AREA_RADIUS_METERS * EDGE_ORBIT_ONSET_RADIUS_FRACTION
  if (distanceFromCentreMeters <= onsetRadiusMeters || distanceFromCentreMeters < 1e-3) return

  scratchRadialOutDirection.copy(positionMeters).divideScalar(distanceFromCentreMeters)
  const outwardSpeed = velocityMetersPerSecond.dot(scratchRadialOutDirection)

  // ease the OUTWARD component away from 0 at the onset radius to fully removed at the boundary, so
  // the ship gradually rounds into a tangential far orbit (never an inward shove). Inward motion is
  // left untouched, so thrusting back toward the field works normally.
  if (outwardSpeed > 0) {
    const damping = Math.min(
      1,
      (distanceFromCentreMeters - onsetRadiusMeters) / (PLAY_AREA_RADIUS_METERS - onsetRadiusMeters),
    )
    velocityMetersPerSecond.addScaledVector(scratchRadialOutDirection, -outwardSpeed * damping)
  }

  // hard stop at the boundary: never let the ship actually leave the field sphere
  if (distanceFromCentreMeters > PLAY_AREA_RADIUS_METERS) {
    positionMeters.setLength(PLAY_AREA_RADIUS_METERS)
  }
}
