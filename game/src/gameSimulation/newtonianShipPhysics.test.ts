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
  thrustTurnRateRadiansPerSecond: 0.6,
  enemyTrackTurnRateRadiansPerSecond: 1.2,
}

const FIXED_TIMESTEP_SECONDS = 1 / 60

function makeControlInput(overrides: Partial<ShipFlightControlInput>): ShipFlightControlInput {
  return { pitchInput: 0, yawInput: 0, thrustActive: false, ...overrides }
}

describe('stepShipFlightSimulation (D54 constant-momentum model)', () => {
  it('holds a constant cruise speed regardless of input (from rest it seeds along the facing)', () => {
    const shipState = createShipRigidBodyStateAtRest()
    const input = makeControlInput({ thrustActive: true, yawInput: 1 })

    for (let stepIndex = 0; stepIndex < 600; stepIndex++) {
      stepShipFlightSimulation(shipState, input, testFlightStats, FIXED_TIMESTEP_SECONDS)
      // after the first step the speed is exactly the cruise speed and never drifts from it
      expect(shipState.velocityMetersPerSecond.length()).toBeCloseTo(
        testFlightStats.cruiseSpeedMetersPerSecond,
        6,
      )
    }
  })

  it('coasts in a straight line when thrust is NOT held — velocity direction is unchanged even while the facing rotates', () => {
    const shipState = createShipRigidBodyStateAtRest()
    shipState.velocityMetersPerSecond.set(testFlightStats.cruiseSpeedMetersPerSecond, 0, 0) // moving +X
    // hold yaw (facing rotates) but no thrust → momentum must stay pointing +X
    const noThrustTurningInput = makeControlInput({ yawInput: 1, thrustActive: false })

    for (let stepIndex = 0; stepIndex < 120; stepIndex++) {
      stepShipFlightSimulation(shipState, noThrustTurningInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }

    const velocityDirection = shipState.velocityMetersPerSecond.clone().normalize()
    expect(velocityDirection.x).toBeGreaterThan(0.9999) // still +X
    expect(shipState.velocityMetersPerSecond.length()).toBeCloseTo(testFlightStats.cruiseSpeedMetersPerSecond, 6)
  })

  it('holding thrust rotates the velocity vector toward the ship facing (slingshot-free direction change)', () => {
    const shipState = createShipRigidBodyStateAtRest()
    shipState.velocityMetersPerSecond.set(testFlightStats.cruiseSpeedMetersPerSecond, 0, 0) // moving +X
    // facing stays at the default -Z; thrust should curve velocity from +X toward -Z
    const thrustInput = makeControlInput({ thrustActive: true })

    const forwardDirection = getShipForwardDirection(shipState, new Vector3())
    const initialAngle = shipState.velocityMetersPerSecond.clone().normalize().angleTo(forwardDirection)

    for (let stepIndex = 0; stepIndex < 5; stepIndex++) {
      stepShipFlightSimulation(shipState, thrustInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }
    const angleAfterFewSteps = shipState.velocityMetersPerSecond.clone().normalize().angleTo(forwardDirection)
    expect(angleAfterFewSteps).toBeLessThan(initialAngle) // turning toward the nose

    for (let stepIndex = 0; stepIndex < 300; stepIndex++) {
      stepShipFlightSimulation(shipState, thrustInput, testFlightStats, FIXED_TIMESTEP_SECONDS)
    }
    const finalDirection = shipState.velocityMetersPerSecond.clone().normalize()
    expect(finalDirection.dot(forwardDirection)).toBeGreaterThan(0.999) // velocity now aligned with facing
    expect(shipState.velocityMetersPerSecond.length()).toBeCloseTo(testFlightStats.cruiseSpeedMetersPerSecond, 6)
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
