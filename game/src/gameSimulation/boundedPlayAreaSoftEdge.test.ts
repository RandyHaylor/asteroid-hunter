import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { PLAY_AREA_RADIUS_METERS } from '../asteroids/asteroidFieldSpawner'
import { easeShipIntoFieldEdgeOrbit } from './boundedPlayAreaSoftEdge'

// D61: bounded sphere with a FAR-ORBIT edge — free flight inside; near the boundary the outward
// radial velocity is damped and the ship is clamped onto the sphere (a tangential glide), with NO
// inward push (no turn-back). The player keeps control and can thrust back inward.

describe('easeShipIntoFieldEdgeOrbit', () => {
  it('leaves the ship untouched well inside the field', () => {
    const positionMeters = new Vector3(100, 0, 0)
    const velocityMetersPerSecond = new Vector3(80, 0, 0)
    easeShipIntoFieldEdgeOrbit(positionMeters, velocityMetersPerSecond)
    expect(positionMeters.x).toBe(100)
    expect(velocityMetersPerSecond.x).toBe(80)
  })

  it('past the boundary moving outward: clamps to the boundary and removes the OUTWARD radial velocity, keeping tangential motion', () => {
    const positionMeters = new Vector3(PLAY_AREA_RADIUS_METERS + 50, 0, 0)
    const velocityMetersPerSecond = new Vector3(60, 0, 60) // +x outward (radial), +z tangential
    easeShipIntoFieldEdgeOrbit(positionMeters, velocityMetersPerSecond)
    expect(positionMeters.length()).toBeCloseTo(PLAY_AREA_RADIUS_METERS, 3)
    expect(velocityMetersPerSecond.x).toBeCloseTo(0, 5) // no more leaving the field
    expect(velocityMetersPerSecond.z).toBeCloseTo(60, 5) // tangential far-orbit glide preserved
  })

  it('never shoves the ship inward (no turn-back): inward velocity is left untouched', () => {
    const positionMeters = new Vector3(PLAY_AREA_RADIUS_METERS + 10, 0, 0)
    const velocityMetersPerSecond = new Vector3(-50, 0, 0) // already heading back inward
    easeShipIntoFieldEdgeOrbit(positionMeters, velocityMetersPerSecond)
    expect(velocityMetersPerSecond.x).toBe(-50)
  })
})
