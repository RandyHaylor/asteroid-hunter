import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  isShipAlignedForLaserFire,
  LASER_FIRING_ALIGNMENT_MAX_DEGREES,
} from './laserAlignmentGate'

// identity forward = -z. A direction rotated by `degrees` in the XZ plane stays the same length.
const shipForward = new THREE.Vector3(0, 0, -1)
function aimRotatedByDegrees(degrees: number): THREE.Vector3 {
  const rad = (degrees * Math.PI) / 180
  return new THREE.Vector3(Math.sin(rad), 0, -Math.cos(rad))
}

describe('isShipAlignedForLaserFire', () => {
  it('fires when the directions are identical', () => {
    expect(isShipAlignedForLaserFire(shipForward, shipForward.clone())).toBe(true)
  })

  it('fires when 3° apart (within the default 5°)', () => {
    expect(isShipAlignedForLaserFire(shipForward, aimRotatedByDegrees(3))).toBe(true)
  })

  it('does not fire when 10° apart (outside the default 5°)', () => {
    expect(isShipAlignedForLaserFire(shipForward, aimRotatedByDegrees(10))).toBe(false)
  })

  it('fires just inside the boundary (4.9°) and not just outside (5.1°)', () => {
    expect(isShipAlignedForLaserFire(shipForward, aimRotatedByDegrees(4.9))).toBe(true)
    expect(isShipAlignedForLaserFire(shipForward, aimRotatedByDegrees(5.1))).toBe(false)
  })

  it('honors a custom maxAlignmentDegrees argument', () => {
    const aim = aimRotatedByDegrees(8)
    // 8° fails the default gate but passes a widened 12° gate.
    expect(isShipAlignedForLaserFire(shipForward, aim)).toBe(false)
    expect(isShipAlignedForLaserFire(shipForward, aim, 12)).toBe(true)
  })

  it('does not fire when either input is zero-length', () => {
    const zero = new THREE.Vector3(0, 0, 0)
    expect(isShipAlignedForLaserFire(zero, shipForward.clone())).toBe(false)
    expect(isShipAlignedForLaserFire(shipForward, zero)).toBe(false)
  })

  it('does not mutate its input vectors', () => {
    const forward = new THREE.Vector3(0, 0, -4)
    const aim = aimRotatedByDegrees(2).multiplyScalar(7)
    const forwardBefore = forward.clone()
    const aimBefore = aim.clone()
    isShipAlignedForLaserFire(forward, aim)
    expect(forward.equals(forwardBefore)).toBe(true)
    expect(aim.equals(aimBefore)).toBe(true)
  })

  it('exposes the default max alignment as 5 degrees', () => {
    expect(LASER_FIRING_ALIGNMENT_MAX_DEGREES).toBe(5)
  })
})
