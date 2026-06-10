import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { PLAY_AREA_RADIUS_METERS } from '../asteroids/asteroidFieldSpawner'
import { applySoftBoundaryPushback } from './boundedPlayAreaSoftEdge'

// D10: soft-edged bounded sphere — free flight inside, gentle inward push past 90% radius.

describe('applySoftBoundaryPushback', () => {
  it('leaves position and velocity untouched inside 80% of the play radius', () => {
    const positionMeters = new Vector3(PLAY_AREA_RADIUS_METERS * 0.8, 0, 0)
    const velocityMetersPerSecond = new Vector3(50, 10, -5)

    applySoftBoundaryPushback(positionMeters, velocityMetersPerSecond, 1 / 60)

    expect(positionMeters.x).toBe(PLAY_AREA_RADIUS_METERS * 0.8)
    expect(velocityMetersPerSecond.x).toBe(50)
    expect(velocityMetersPerSecond.y).toBe(10)
    expect(velocityMetersPerSecond.z).toBe(-5)
  })

  it('leaves an object at the exact 90% onset radius untouched', () => {
    const positionMeters = new Vector3(0, PLAY_AREA_RADIUS_METERS * 0.9, 0)
    const velocityMetersPerSecond = new Vector3(0, 30, 0)

    applySoftBoundaryPushback(positionMeters, velocityMetersPerSecond, 1 / 60)

    expect(velocityMetersPerSecond.y).toBe(30)
  })

  it('accumulates inward velocity over repeated steps beyond the boundary', () => {
    // start drifting outward right at the play-area edge
    const positionMeters = new Vector3(PLAY_AREA_RADIUS_METERS, 0, 0)
    const velocityMetersPerSecond = new Vector3(20, 0, 0)
    const stepSeconds = 1 / 60

    let previousOutwardSpeed = velocityMetersPerSecond.x
    for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
      applySoftBoundaryPushback(positionMeters, velocityMetersPerSecond, stepSeconds)
      positionMeters.addScaledVector(velocityMetersPerSecond, stepSeconds)
      // every step beyond the boundary must bleed outward speed (gain inward velocity)
      expect(velocityMetersPerSecond.x).toBeLessThan(previousOutwardSpeed)
      previousOutwardSpeed = velocityMetersPerSecond.x
    }
  })

  it('eventually turns an outbound ship back toward the field', () => {
    const positionMeters = new Vector3(0, 0, PLAY_AREA_RADIUS_METERS * 1.05)
    const velocityMetersPerSecond = new Vector3(0, 0, 40)
    const stepSeconds = 1 / 60

    // simulate up to 20 seconds; the quadratic ramp must reverse the outward motion
    for (let stepIndex = 0; stepIndex < 60 * 20; stepIndex += 1) {
      applySoftBoundaryPushback(positionMeters, velocityMetersPerSecond, stepSeconds)
      positionMeters.addScaledVector(velocityMetersPerSecond, stepSeconds)
      if (velocityMetersPerSecond.z < 0) break
    }

    expect(velocityMetersPerSecond.z).toBeLessThan(0)
    // and the ship must not have escaped far past the soft edge while turning around
    expect(positionMeters.length()).toBeLessThan(PLAY_AREA_RADIUS_METERS * 1.5)
  })

  it('pushes inward along the radial direction for an off-axis position', () => {
    const positionMeters = new Vector3(1, 1, 1).normalize().multiplyScalar(PLAY_AREA_RADIUS_METERS * 1.1)
    const velocityMetersPerSecond = new Vector3()

    applySoftBoundaryPushback(positionMeters, velocityMetersPerSecond, 1)

    // at 110% radius the full ~80 m/s² acceleration applies, pointed at the center
    const inwardDirection = positionMeters.clone().normalize().multiplyScalar(-1)
    const inwardSpeed = velocityMetersPerSecond.dot(inwardDirection)
    expect(inwardSpeed).toBeCloseTo(80, 1)
  })
})
