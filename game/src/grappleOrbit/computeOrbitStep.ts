import { Vector3 } from 'three'

// D60: kinematic-arc orbit step for the grapple/slingshot mechanic. While the ship is latched to an
// asteroid it is carried along a circle of FIXED radius around the asteroid, at constant cruise speed,
// in the orbit plane fixed at latch time (the plane perpendicular to orbitAxisUnit). On release the
// caller simply keeps the returned (tangential) velocity, so the ship slingshots off in a straight
// line. Pure: writes only the provided out-vectors; the ship's FACING and the camera are handled
// elsewhere and are NOT affected by orbiting.

const scratchRadiusVector = new Vector3()

export function computeOrbitStep(
  currentPositionMeters: Vector3,
  orbitCenterMeters: Vector3,
  orbitAxisUnit: Vector3,
  orbitRadiusMeters: number,
  cruiseSpeedMetersPerSecond: number,
  deltaSeconds: number,
  outPositionMeters: Vector3,
  outVelocityMetersPerSecond: Vector3,
): void {
  scratchRadiusVector.copy(currentPositionMeters).sub(orbitCenterMeters)
  if (scratchRadiusVector.lengthSq() < 1e-8 || orbitRadiusMeters < 1e-4) {
    // degenerate — no well-defined circle this frame; hold the position and emit no velocity
    outPositionMeters.copy(currentPositionMeters)
    outVelocityMetersPerSecond.set(0, 0, 0)
    return
  }

  // angular step chosen so the LINEAR speed around the fixed radius stays at the cruise speed
  const angularStepRadians = (cruiseSpeedMetersPerSecond / orbitRadiusMeters) * deltaSeconds
  scratchRadiusVector.applyAxisAngle(orbitAxisUnit, angularStepRadians)
  // re-impose the fixed orbit radius (keeps a clean circle even if the asteroid center drifts)
  scratchRadiusVector.setLength(orbitRadiusMeters)

  outPositionMeters.copy(orbitCenterMeters).add(scratchRadiusVector)
  // tangential velocity = axis × radius, at cruise speed — the instantaneous direction of travel
  outVelocityMetersPerSecond.copy(orbitAxisUnit).cross(scratchRadiusVector).setLength(cruiseSpeedMetersPerSecond)
}
