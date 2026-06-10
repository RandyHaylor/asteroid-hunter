import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { computeLeadAimDirection } from './targetLeadPrediction'

/** advance a projectile and a linearly-moving target; return their closest approach distance */
function simulateClosestApproachMeters(
  shooterPosition: Vector3,
  aimDirection: Vector3,
  projectileSpeed: number,
  targetStartPosition: Vector3,
  targetVelocity: Vector3,
): number {
  const stepSeconds = 1 / 240
  const projectilePosition = shooterPosition.clone()
  const projectileVelocity = aimDirection.clone().multiplyScalar(projectileSpeed)
  const targetPosition = targetStartPosition.clone()
  let closestApproachMeters = Infinity
  for (let stepIndex = 0; stepIndex < 240 * 10; stepIndex++) {
    projectilePosition.addScaledVector(projectileVelocity, stepSeconds)
    targetPosition.addScaledVector(targetVelocity, stepSeconds)
    closestApproachMeters = Math.min(closestApproachMeters, projectilePosition.distanceTo(targetPosition))
  }
  return closestApproachMeters
}

describe('computeLeadAimDirection', () => {
  it('aims straight at a stationary target', () => {
    const aimDirection = computeLeadAimDirection(
      new Vector3(0, 0, 0),
      new Vector3(100, 50, -200),
      new Vector3(0, 0, 0),
      500,
      new Vector3(),
    )
    const directDirection = new Vector3(100, 50, -200).normalize()
    expect(aimDirection.distanceTo(directDirection)).toBeLessThan(1e-6)
  })

  it('leads a crossing target so the projectile actually intercepts it (the reported lock bug)', () => {
    const shooterPosition = new Vector3(0, 0, 0)
    const targetStart = new Vector3(0, 0, -250)
    const targetVelocity = new Vector3(50, 0, 0) // crossing at orbit-strafe speed
    const boltSpeed = 500

    const aimDirection = computeLeadAimDirection(shooterPosition, targetStart, targetVelocity, boltSpeed, new Vector3())

    const closestApproach = simulateClosestApproachMeters(
      shooterPosition,
      aimDirection,
      boltSpeed,
      targetStart,
      targetVelocity,
    )
    expect(closestApproach).toBeLessThan(1) // direct aim would miss by ~25 m here

    // and confirm direct aim WOULD have missed by more than the 4 m hit radius
    const directAim = targetStart.clone().normalize()
    const directMiss = simulateClosestApproachMeters(shooterPosition, directAim, boltSpeed, targetStart, targetVelocity)
    expect(directMiss).toBeGreaterThan(4)
  })

  it('leads a slow missile against a moving target', () => {
    const shooterPosition = new Vector3(0, 0, 0)
    const targetStart = new Vector3(100, 0, -400)
    const targetVelocity = new Vector3(-30, 20, 10)
    const missileSpeed = 140

    const aimDirection = computeLeadAimDirection(
      shooterPosition,
      targetStart,
      targetVelocity,
      missileSpeed,
      new Vector3(),
    )

    const closestApproach = simulateClosestApproachMeters(
      shooterPosition,
      aimDirection,
      missileSpeed,
      targetStart,
      targetVelocity,
    )
    expect(closestApproach).toBeLessThan(1)
  })

  it('falls back to direct aim when the target outruns the projectile away from the shooter', () => {
    const aimDirection = computeLeadAimDirection(
      new Vector3(0, 0, 0),
      new Vector3(0, 0, -100),
      new Vector3(0, 0, -200), // fleeing faster than the projectile
      140,
      new Vector3(),
    )
    const directDirection = new Vector3(0, 0, -1)
    expect(aimDirection.distanceTo(directDirection)).toBeLessThan(1e-6)
  })
})
