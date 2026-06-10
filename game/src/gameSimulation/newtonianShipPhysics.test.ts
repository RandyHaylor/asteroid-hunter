import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  createShipRigidBodyStateAtRest,
  getShipForwardDirection,
  stepShipFlightSimulation,
  type ShipFlightControlInput,
} from './newtonianShipPhysics'
import type { ShipFlightStats } from '../shipStats'

const testFlightStats: ShipFlightStats = {
  shipMassKg: 1000,
  maxThrustNewtons: 60_000,
  maxTurnRateRadiansPerSecond: 1.6,
  maxForwardSpeedMetersPerSecond: 80,
  aimAssistMaxTurnRateRadiansPerSecond: 0.5,
}

const FIXED_TIMESTEP_SECONDS = 1 / 60

function makeControlInput(overrides: Partial<ShipFlightControlInput>): ShipFlightControlInput {
  return { pitchInput: 0, yawInput: 0, throttleFraction: 0, ...overrides }
}

describe('stepShipFlightSimulation', () => {
  it('full throttle from rest accelerates forward (-Z) and settles at max speed without exceeding it', () => {
    const shipState = createShipRigidBodyStateAtRest()
    const fullThrottleInput = makeControlInput({ throttleFraction: 1 })

    for (let stepIndex = 0; stepIndex < 600; stepIndex++) {
      stepShipFlightSimulation(shipState, fullThrottleInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
      expect(shipState.velocityMetersPerSecond.length()).toBeLessThanOrEqual(
        testFlightStats.maxForwardSpeedMetersPerSecond * 1.001,
      )
    }

    expect(shipState.velocityMetersPerSecond.length()).toBeGreaterThan(
      testFlightStats.maxForwardSpeedMetersPerSecond * 0.95,
    )
    expect(shipState.velocityMetersPerSecond.z).toBeLessThan(0)
    expect(shipState.positionMeters.z).toBeLessThan(0)
  })

  it('per-step velocity change never exceeds what max engine thrust allows (realistic acceleration, R3)', () => {
    const shipState = createShipRigidBodyStateAtRest()
    const fullThrottleInput = makeControlInput({ throttleFraction: 1 })
    const maxEngineAcceleration = testFlightStats.maxThrustNewtons / testFlightStats.shipMassKg
    const maxVelocityChangePerStep = maxEngineAcceleration * FIXED_TIMESTEP_SECONDS

    const velocityBeforeStep = new Vector3()
    for (let stepIndex = 0; stepIndex < 120; stepIndex++) {
      velocityBeforeStep.copy(shipState.velocityMetersPerSecond)
      stepShipFlightSimulation(shipState, fullThrottleInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
      const velocityChange = shipState.velocityMetersPerSecond.distanceTo(velocityBeforeStep)
      expect(velocityChange).toBeLessThanOrEqual(maxVelocityChangePerStep * 1.0001)
    }
  })

  it('positive yaw input turns the nose right (+X) from the initial -Z facing', () => {
    const shipState = createShipRigidBodyStateAtRest()
    const yawRightInput = makeControlInput({ yawInput: 1 })

    for (let stepIndex = 0; stepIndex < 30; stepIndex++) {
      stepShipFlightSimulation(shipState, yawRightInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }

    const forwardDirection = getShipForwardDirection(shipState, new Vector3())
    expect(forwardDirection.x).toBeGreaterThan(0.1)
  })

  it('positive pitch input raises the nose (+Y) from the initial -Z facing', () => {
    const shipState = createShipRigidBodyStateAtRest()
    const pitchUpInput = makeControlInput({ pitchInput: 1 })

    for (let stepIndex = 0; stepIndex < 30; stepIndex++) {
      stepShipFlightSimulation(shipState, pitchUpInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }

    const forwardDirection = getShipForwardDirection(shipState, new Vector3())
    expect(forwardDirection.y).toBeGreaterThan(0.1)
  })

  it('cutting the throttle decelerates the ship back toward rest', () => {
    const shipState = createShipRigidBodyStateAtRest()
    shipState.velocityMetersPerSecond.set(0, 0, -60)
    const zeroThrottleInput = makeControlInput({ throttleFraction: 0 })

    for (let stepIndex = 0; stepIndex < 600; stepIndex++) {
      stepShipFlightSimulation(shipState, zeroThrottleInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }

    expect(shipState.velocityMetersPerSecond.length()).toBeLessThan(1)
  })

  it('velocity lags facing when turning at speed (inertia/drift, D12)', () => {
    const shipState = createShipRigidBodyStateAtRest()
    shipState.velocityMetersPerSecond.set(0, 0, -80)
    const turningInput = makeControlInput({ throttleFraction: 1, yawInput: 1 })

    for (let stepIndex = 0; stepIndex < 30; stepIndex++) {
      stepShipFlightSimulation(shipState, turningInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }

    const forwardDirection = getShipForwardDirection(shipState, new Vector3())
    const velocityDirection = shipState.velocityMetersPerSecond.clone().normalize()
    const alignment = forwardDirection.dot(velocityDirection)
    expect(alignment).toBeLessThan(0.9999)
  })

  it('D15: turn rate ramps in instead of snapping to max — first step rotates less than a full-rate step', () => {
    const shipState = createShipRigidBodyStateAtRest()
    const yawRightInput = makeControlInput({ yawInput: 1 })
    const fullRateStepAngle = testFlightStats.maxTurnRateRadiansPerSecond * FIXED_TIMESTEP_SECONDS

    stepShipFlightSimulation(shipState, yawRightInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    const forwardAfterFirstStep = getShipForwardDirection(shipState, new Vector3())
    const firstStepAngle = Math.asin(Math.min(1, Math.abs(forwardAfterFirstStep.x)))
    expect(firstStepAngle).toBeLessThan(fullRateStepAngle * 0.5)

    // with the input held, the smoothed rate converges to the commanded max
    for (let stepIndex = 0; stepIndex < 120; stepIndex++) {
      stepShipFlightSimulation(shipState, yawRightInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }
    expect(Math.abs(shipState.currentYawRateRadiansPerSecond)).toBeGreaterThan(
      testFlightStats.maxTurnRateRadiansPerSecond * 0.98,
    )
  })
})
