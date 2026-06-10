import { Vector3 } from 'three'

// Generic lead-the-target solver: aim where the target WILL be when the projectile arrives,
// not where it is now. Works for any projectile speed (a weapon stat — upgrades change it, and
// the lock automatically leads correctly). Solves |targetPos + targetVel·t − shooterPos| = speed·t
// for the soonest positive intercept time t.

// scratch objects reused every call to avoid per-frame allocations in the hot combat path
const scratchShooterToTarget = new Vector3()
const scratchPredictedInterceptPoint = new Vector3()

export function computeLeadAimDirection(
  shooterPositionMeters: Vector3,
  targetPositionMeters: Vector3,
  targetVelocityMetersPerSecond: Vector3,
  projectileSpeedMetersPerSecond: number,
  outAimDirection: Vector3,
): Vector3 {
  scratchShooterToTarget.copy(targetPositionMeters).sub(shooterPositionMeters)

  // quadratic in intercept time t: (|v|² − s²)·t² + 2(d·v)·t + |d|² = 0
  const quadraticA =
    targetVelocityMetersPerSecond.lengthSq() - projectileSpeedMetersPerSecond * projectileSpeedMetersPerSecond
  const quadraticB = 2 * scratchShooterToTarget.dot(targetVelocityMetersPerSecond)
  const quadraticC = scratchShooterToTarget.lengthSq()

  let interceptTimeSeconds = 0
  if (Math.abs(quadraticA) < 1e-6) {
    // projectile speed ≈ target speed: degenerates to linear — solvable only when closing
    interceptTimeSeconds = Math.abs(quadraticB) > 1e-6 ? -quadraticC / quadraticB : -1
  } else {
    const discriminant = quadraticB * quadraticB - 4 * quadraticA * quadraticC
    if (discriminant >= 0) {
      const discriminantRoot = Math.sqrt(discriminant)
      const earlierRoot = (-quadraticB - discriminantRoot) / (2 * quadraticA)
      const laterRoot = (-quadraticB + discriminantRoot) / (2 * quadraticA)
      // soonest positive intercept
      interceptTimeSeconds = earlierRoot > 0 ? earlierRoot : laterRoot
    } else {
      interceptTimeSeconds = -1
    }
  }

  // no positive intercept (target outruns the projectile) — fall back to direct aim
  if (!(interceptTimeSeconds > 0) || !Number.isFinite(interceptTimeSeconds)) {
    return outAimDirection.copy(scratchShooterToTarget).normalize()
  }

  scratchPredictedInterceptPoint
    .copy(targetPositionMeters)
    .addScaledVector(targetVelocityMetersPerSecond, interceptTimeSeconds)
  return outAimDirection.copy(scratchPredictedInterceptPoint).sub(shooterPositionMeters).normalize()
}
