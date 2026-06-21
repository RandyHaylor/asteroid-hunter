import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { classifyAsteroidGrappleEligibility } from './asteroidGrappleEligibility'

const SHIP = new Vector3(0, 0, 0)
const TRAVEL_MINUS_Z = new Vector3(0, 0, -80) // ship travelling toward -Z

describe('classifyAsteroidGrappleEligibility', () => {
  it('an asteroid dead ahead is approachingInFront (not grappleable)', () => {
    expect(classifyAsteroidGrappleEligibility(SHIP, new Vector3(0, 0, -100), TRAVEL_MINUS_Z)).toBe('approachingInFront')
  })

  it('an asteroid exactly to the side (on the perpendicular plane) is grappleable', () => {
    expect(classifyAsteroidGrappleEligibility(SHIP, new Vector3(100, 0, 0), TRAVEL_MINUS_Z)).toBe('grappleable')
  })

  it('an asteroid just behind the plane (within 45°) is grappleable', () => {
    // 30° behind the plane: mostly sideways, slightly back (+Z)
    expect(classifyAsteroidGrappleEligibility(SHIP, new Vector3(100, 0, 58), TRAVEL_MINUS_Z)).toBe('grappleable')
  })

  it('an asteroid nearly straight behind (past 45°) is passedBehind', () => {
    expect(classifyAsteroidGrappleEligibility(SHIP, new Vector3(20, 0, 100), TRAVEL_MINUS_Z)).toBe('passedBehind')
  })

  it('returns noTravel when the ship is essentially stationary', () => {
    expect(classifyAsteroidGrappleEligibility(SHIP, new Vector3(100, 0, 0), new Vector3(0, 0, 0))).toBe('noTravel')
  })
})
