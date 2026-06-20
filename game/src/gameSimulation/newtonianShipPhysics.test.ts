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
  cruiseSpeedMetersPerSecond: 80,
  maxTurnRateRadiansPerSecond: 1.6,
  turnAccelerationRadiansPerSecondSquared: 2.5,
  thrustAccelerationMetersPerSecondSquared: 20,
  enemyTrackTurnRateRadiansPerSecond: 1.2,
}

const FIXED_TIMESTEP_SECONDS = 1 / 60

function makeControlInput(overrides: Partial<ShipFlightControlInput>): ShipFlightControlInput {
  return { pitchInput: 0, yawInput: 0, thrustActive: false, ...overrides }
}

describe('stepShipFlightSimulation (D88 variable-speed Newtonian model)', () => {
  it('holding thrust from rest accelerates along the facing up to — and capped at — the max speed', () => {
    const shipState = createShipRigidBodyStateAtRest()
    const input = makeControlInput({ thrustActive: true })
    const forwardDirection = getShipForwardDirection(shipState, new Vector3())

    // one step: speed grew by ~accel*dt and points along the facing
    stepShipFlightSimulation(shipState, input, testFlightStats, FIXED_TIMESTEP_SECONDS)
    expect(shipState.velocityMetersPerSecond.length()).toBeCloseTo(
      testFlightStats.thrustAccelerationMetersPerSecondSquared * FIXED_TIMESTEP_SECONDS,
      5,
    )
    expect(shipState.velocityMetersPerSecond.clone().normalize().dot(forwardDirection)).toBeGreaterThan(0.999)

    // hold thrust long enough to exceed the cap, then confirm it is clamped to max, never above
    for (let stepIndex = 0; stepIndex < 1200; stepIndex++) {
      stepShipFlightSimulation(shipState, input, testFlightStats, FIXED_TIMESTEP_SECONDS)
      expect(shipState.velocityMetersPerSecond.length()).toBeLessThanOrEqual(
        testFlightStats.cruiseSpeedMetersPerSecond + 1e-6,
      )
    }
    expect(shipState.velocityMetersPerSecond.length()).toBeCloseTo(testFlightStats.cruiseSpeedMetersPerSecond, 4)
  })

  it('coasts with velocity EXACTLY preserved when thrust is not held, even while the facing rotates', () => {
    const shipState = createShipRigidBodyStateAtRest()
    shipState.velocityMetersPerSecond.set(testFlightStats.cruiseSpeedMetersPerSecond, 0, 0) // moving +X
    // hold yaw (facing rotates) but no thrust → momentum must stay pointing +X at the same magnitude
    const noThrustTurningInput = makeControlInput({ yawInput: 1, thrustActive: false })

    for (let stepIndex = 0; stepIndex < 120; stepIndex++) {
      stepShipFlightSimulation(shipState, noThrustTurningInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }

    const velocityDirection = shipState.velocityMetersPerSecond.clone().normalize()
    expect(velocityDirection.x).toBeGreaterThan(0.9999) // still +X
    expect(shipState.velocityMetersPerSecond.length()).toBeCloseTo(testFlightStats.cruiseSpeedMetersPerSecond, 6)
  })

  it('thrusting opposite to travel LOSES speed; thrusting along travel GAINS speed', () => {
    // facing default is -Z. Set velocity along the FACING (-Z) to test gain, then opposite (+Z) to test loss.
    const gainState = createShipRigidBodyStateAtRest()
    gainState.velocityMetersPerSecond.set(0, 0, -40) // moving along the -Z facing (aligned)
    stepShipFlightSimulation(gainState, makeControlInput({ thrustActive: true }), testFlightStats, FIXED_TIMESTEP_SECONDS)
    expect(gainState.velocityMetersPerSecond.length()).toBeGreaterThan(40) // gained speed

    const loseState = createShipRigidBodyStateAtRest()
    loseState.velocityMetersPerSecond.set(0, 0, 40) // moving +Z, OPPOSITE the -Z facing
    stepShipFlightSimulation(loseState, makeControlInput({ thrustActive: true }), testFlightStats, FIXED_TIMESTEP_SECONDS)
    expect(loseState.velocityMetersPerSecond.length()).toBeLessThan(40) // lost speed (decelerated)
    expect(loseState.velocityMetersPerSecond.z).toBeGreaterThan(0) // still moving +Z (not yet reversed)
  })

  it('positive yaw input turns the nose right (+X) from the initial -Z facing (facing is independent)', () => {
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

  it('D15: turn rate ramps in instead of snapping to max — first step rotates less than a full-rate step', () => {
    const shipState = createShipRigidBodyStateAtRest()
    const yawRightInput = makeControlInput({ yawInput: 1 })
    const fullRateStepAngle = testFlightStats.maxTurnRateRadiansPerSecond * FIXED_TIMESTEP_SECONDS

    stepShipFlightSimulation(shipState, yawRightInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    const forwardAfterFirstStep = getShipForwardDirection(shipState, new Vector3())
    const firstStepAngle = Math.asin(Math.min(1, Math.abs(forwardAfterFirstStep.x)))
    expect(firstStepAngle).toBeLessThan(fullRateStepAngle * 0.5)

    for (let stepIndex = 0; stepIndex < 120; stepIndex++) {
      stepShipFlightSimulation(shipState, yawRightInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }
    expect(Math.abs(shipState.currentYawRateRadiansPerSecond)).toBeGreaterThan(
      testFlightStats.maxTurnRateRadiansPerSecond * 0.98,
    )
  })
})
