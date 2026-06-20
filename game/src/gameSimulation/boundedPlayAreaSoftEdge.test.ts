import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { PLAY_AREA_RADIUS_METERS } from '../asteroids/asteroidFieldSpawner'
import { easeShipIntoFieldEdgeOrbit } from './boundedPlayAreaSoftEdge'

// D62: field edge gently steers the velocity DIRECTION into a far orbit at CONSTANT speed (no shove,
// no damp), and only when the radar isn't being actively dragged.

const NOT_DRAGGING = false
const IS_DRAGGING = true
const STEP_SECONDS = 1 / 60

describe('easeShipIntoFieldEdgeOrbit', () => {
  it('leaves the ship untouched well inside the field', () => {
    const position = new Vector3(100, 0, 0)
    const velocity = new Vector3(80, 0, 0)
    easeShipIntoFieldEdgeOrbit(position, velocity, STEP_SECONDS, NOT_DRAGGING)
    expect(velocity.x).toBe(80)
  })

  it('past the edge moving outward: keeps the SAME speed but steers the outward velocity toward the tangent', () => {
    const position = new Vector3(PLAY_AREA_RADIUS_METERS * 1.7, 0, 0)
    const velocity = new Vector3(60, 0, 60) // +x outward (radial), +z tangential
    const speedBefore = velocity.length()
    const outwardSpeedBefore = velocity.x
    easeShipIntoFieldEdgeOrbit(position, velocity, STEP_SECONDS, NOT_DRAGGING)
    expect(velocity.length()).toBeCloseTo(speedBefore, 5) // constant speed (no damp)
    expect(velocity.x).toBeLessThan(outwardSpeedBefore) // outward component reduced (curving into orbit)
    expect(velocity.x).toBeGreaterThan(0) // gentle — not snapped
  })

  it('does NOT steer while the player is dragging the radar', () => {
    const position = new Vector3(PLAY_AREA_RADIUS_METERS * 1.7, 0, 0)
    const velocity = new Vector3(60, 0, 60)
    easeShipIntoFieldEdgeOrbit(position, velocity, STEP_SECONDS, IS_DRAGGING)
    expect(velocity.x).toBe(60)
    expect(velocity.z).toBe(60)
  })

  it('does nothing when already heading inward (no turn-back, lets the player fly back in)', () => {
    const position = new Vector3(PLAY_AREA_RADIUS_METERS * 1.7, 0, 0)
    const velocity = new Vector3(-50, 0, 0)
    easeShipIntoFieldEdgeOrbit(position, velocity, STEP_SECONDS, NOT_DRAGGING)
    expect(velocity.x).toBe(-50)
  })

  it('repeated steps drive the outward velocity to ~0 (settled into a far orbit) at constant speed', () => {
    const position = new Vector3(PLAY_AREA_RADIUS_METERS * 1.7, 0, 0)
    const velocity = new Vector3(60, 0, 60)
    const speedBefore = velocity.length()
    for (let stepIndex = 0; stepIndex < 600; stepIndex++) {
      easeShipIntoFieldEdgeOrbit(position, velocity, STEP_SECONDS, NOT_DRAGGING)
    }
    expect(velocity.length()).toBeCloseTo(speedBefore, 4) // speed never changed
    expect(Math.abs(velocity.x)).toBeLessThan(0.5) // outward (radial) motion steered away → orbiting
  })
})
