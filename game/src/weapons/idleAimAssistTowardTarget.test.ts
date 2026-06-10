import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { computeIdleAimAssistRotationInput } from './idleAimAssistTowardTarget'
import type { ShipFlightStats } from '../shipStats'

// identity orientation = ship faces -z (forward), +x is right, +y is up
const identityOrientation = new THREE.Quaternion()
const shipAtOrigin = new THREE.Vector3(0, 0, 0)

const baseFlightStats: ShipFlightStats = {
  shipMassKg: 1000,
  maxThrustNewtons: 60_000,
  maxTurnRateRadiansPerSecond: 1.6,
  maxForwardSpeedMetersPerSecond: 80,
  aimAssistMaxTurnRateRadiansPerSecond: 0.5,
}

const maxAssistInputFraction =
  baseFlightStats.aimAssistMaxTurnRateRadiansPerSecond / baseFlightStats.maxTurnRateRadiansPerSecond

describe('computeIdleAimAssistRotationInput', () => {
  it('produces ~zero input when the target is dead ahead', () => {
    const input = computeIdleAimAssistRotationInput(
      identityOrientation,
      shipAtOrigin,
      new THREE.Vector3(0, 0, -100),
      baseFlightStats,
    )
    expect(input.pitchInput).toBeCloseTo(0, 6)
    expect(input.yawInput).toBeCloseTo(0, 6)
  })

  it('yaws right (positive) for a target slightly off to the right', () => {
    const input = computeIdleAimAssistRotationInput(
      identityOrientation,
      shipAtOrigin,
      new THREE.Vector3(10, 0, -100),
      baseFlightStats,
    )
    expect(input.yawInput).toBeGreaterThan(0)
    expect(Math.abs(input.pitchInput)).toBeCloseTo(0, 6)
  })

  it('pitches up (positive) for a target slightly above', () => {
    const input = computeIdleAimAssistRotationInput(
      identityOrientation,
      shipAtOrigin,
      new THREE.Vector3(0, 10, -100),
      baseFlightStats,
    )
    expect(input.pitchInput).toBeGreaterThan(0)
    expect(Math.abs(input.yawInput)).toBeCloseTo(0, 6)
  })

  it('clamps the input to the assist rate fraction for a large off-nose error', () => {
    const input = computeIdleAimAssistRotationInput(
      identityOrientation,
      shipAtOrigin,
      new THREE.Vector3(100, 0, -100), // 45° off the nose — well past saturation
      baseFlightStats,
    )
    expect(input.yawInput).toBeCloseTo(maxAssistInputFraction, 6)
  })

  it('returns zero input when the assist stat is disabled', () => {
    const disabledStats: ShipFlightStats = { ...baseFlightStats, aimAssistMaxTurnRateRadiansPerSecond: 0 }
    const input = computeIdleAimAssistRotationInput(
      identityOrientation,
      shipAtOrigin,
      new THREE.Vector3(50, 50, -100),
      disabledStats,
    )
    expect(input.pitchInput).toBe(0)
    expect(input.yawInput).toBe(0)
  })

  it('returns zero input when the target sits on the ship', () => {
    const input = computeIdleAimAssistRotationInput(
      identityOrientation,
      shipAtOrigin,
      shipAtOrigin.clone(),
      baseFlightStats,
    )
    expect(input.pitchInput).toBe(0)
    expect(input.yawInput).toBe(0)
  })
})
