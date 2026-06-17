import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { computeOrbitStep } from './computeOrbitStep'

describe('computeOrbitStep (D60 kinematic-arc orbit)', () => {
  const orbitCenter = new Vector3(0, 0, 0)
  const orbitAxis = new Vector3(0, 1, 0) // orbit in the X/Z plane
  const orbitRadius = 10
  const cruiseSpeed = 20
  const dt = 1 / 60

  it('keeps a constant orbit radius and constant cruise speed, staying in the orbit plane', () => {
    const position = new Vector3(orbitRadius, 0, 0)
    const velocity = new Vector3()
    for (let stepIndex = 0; stepIndex < 240; stepIndex++) {
      computeOrbitStep(position, orbitCenter, orbitAxis, orbitRadius, cruiseSpeed, dt, position, velocity)
      expect(position.distanceTo(orbitCenter)).toBeCloseTo(orbitRadius, 5)
      expect(velocity.length()).toBeCloseTo(cruiseSpeed, 5)
      expect(Math.abs(position.y)).toBeLessThan(1e-6) // never leaves the orbit plane (perp to axis)
    }
  })

  it('advances along the circle (tangential travel) and the velocity is perpendicular to the radius', () => {
    const position = new Vector3(orbitRadius, 0, 0)
    const velocity = new Vector3()
    computeOrbitStep(position, orbitCenter, orbitAxis, orbitRadius, cruiseSpeed, dt, position, velocity)
    expect(position.z).toBeLessThan(0) // axis×radius points -Z from +X, so it sweeps toward -Z
    const radiusDirection = position.clone().normalize()
    expect(Math.abs(velocity.clone().normalize().dot(radiusDirection))).toBeLessThan(1e-6)
  })

  it('a tighter (smaller) radius sweeps a larger angle per step — stronger slingshot', () => {
    const tightPosition = new Vector3(4, 0, 0)
    const tightVelocity = new Vector3()
    computeOrbitStep(tightPosition, orbitCenter, orbitAxis, 4, cruiseSpeed, dt, tightPosition, tightVelocity)
    const tightAngle = Math.atan2(-tightPosition.z, tightPosition.x)

    const widePosition = new Vector3(20, 0, 0)
    const wideVelocity = new Vector3()
    computeOrbitStep(widePosition, orbitCenter, orbitAxis, 20, cruiseSpeed, dt, widePosition, wideVelocity)
    const wideAngle = Math.atan2(-widePosition.z, widePosition.x)

    expect(tightAngle).toBeGreaterThan(wideAngle)
  })
})
