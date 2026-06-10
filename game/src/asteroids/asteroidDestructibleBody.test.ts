import { IcosahedronGeometry, Mesh, MeshStandardMaterial, Scene, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'
import {
  applyWeaponDamageToAsteroid,
  updateAsteroidDamageParticles,
} from './asteroidDestructibleBody'

// R12 / A5: damage chips HP, shrinks radius (floored at 40% of original), and HP<=0 destroys.

let nextTestAsteroidId = 1000

function createTestAsteroid(radiusMeters: number, hitPoints: number): AsteroidBody {
  const rockMesh = new Mesh(new IcosahedronGeometry(radiusMeters, 1), new MeshStandardMaterial())
  nextTestAsteroidId += 1
  return {
    asteroidId: nextTestAsteroidId,
    sizeClass: 'medium',
    positionMeters: new Vector3(),
    velocityMetersPerSecond: new Vector3(),
    currentRadiusMeters: radiusMeters,
    massKg: 10_000,
    hitPointsRemaining: hitPoints,
    isDestroyed: false,
    renderObject: rockMesh,
  }
}

const impactPoint = new Vector3(1, 2, 3)

describe('applyWeaponDamageToAsteroid', () => {
  it('reduces hit points and currentRadiusMeters on a chip hit', () => {
    const gameScene = new Scene()
    const asteroid = createTestAsteroid(10, 120)
    gameScene.add(asteroid.renderObject)

    applyWeaponDamageToAsteroid(asteroid, 30, impactPoint, gameScene)

    expect(asteroid.hitPointsRemaining).toBe(90)
    expect(asteroid.currentRadiusMeters).toBeLessThan(10)
    expect(asteroid.currentRadiusMeters).toBeGreaterThan(0)
    expect(asteroid.isDestroyed).toBe(false)
    // render mesh scale tracks the shrunken radius so cover visibly degrades (D11)
    expect(asteroid.renderObject.scale.x).toBeCloseTo(asteroid.currentRadiusMeters / 10)
  })

  it('never shrinks the radius below 40% of the original radius', () => {
    const gameScene = new Scene()
    const asteroid = createTestAsteroid(20, 300)
    gameScene.add(asteroid.renderObject)

    // grind the asteroid down to 1 HP across many small hits
    while (asteroid.hitPointsRemaining > 1) {
      applyWeaponDamageToAsteroid(asteroid, Math.min(7, asteroid.hitPointsRemaining - 1), impactPoint, gameScene)
      expect(asteroid.currentRadiusMeters).toBeGreaterThanOrEqual(20 * 0.4)
    }

    expect(asteroid.isDestroyed).toBe(false)
    expect(asteroid.currentRadiusMeters).toBeGreaterThanOrEqual(20 * 0.4)
  })

  it('marks the asteroid destroyed and removes its mesh when HP reaches zero', () => {
    const gameScene = new Scene()
    const asteroid = createTestAsteroid(5, 50)
    gameScene.add(asteroid.renderObject)

    applyWeaponDamageToAsteroid(asteroid, 50, impactPoint, gameScene)

    expect(asteroid.hitPointsRemaining).toBe(0)
    expect(asteroid.isDestroyed).toBe(true)
    expect(gameScene.children).not.toContain(asteroid.renderObject)
  })

  it('marks destroyed when damage overshoots past zero HP', () => {
    const gameScene = new Scene()
    const asteroid = createTestAsteroid(5, 50)
    gameScene.add(asteroid.renderObject)

    applyWeaponDamageToAsteroid(asteroid, 9999, impactPoint, gameScene)

    expect(asteroid.isDestroyed).toBe(true)
    expect(asteroid.hitPointsRemaining).toBe(0)
  })

  it('ignores further damage once destroyed', () => {
    const gameScene = new Scene()
    const asteroid = createTestAsteroid(5, 50)
    gameScene.add(asteroid.renderObject)

    applyWeaponDamageToAsteroid(asteroid, 50, impactPoint, gameScene)
    applyWeaponDamageToAsteroid(asteroid, 50, impactPoint, gameScene)

    expect(asteroid.hitPointsRemaining).toBe(0)
    expect(asteroid.isDestroyed).toBe(true)
  })
})

describe('updateAsteroidDamageParticles', () => {
  it('spawns a debris burst on damage and expires it after its lifetime', () => {
    const gameScene = new Scene()
    const asteroid = createTestAsteroid(10, 120)
    gameScene.add(asteroid.renderObject)

    applyWeaponDamageToAsteroid(asteroid, 10, impactPoint, gameScene)
    const sceneChildCountWithBurst = gameScene.children.length
    expect(sceneChildCountWithBurst).toBeGreaterThan(1) // rock mesh + debris Points

    // advance well past the 0.8 s burst lifetime — the Points object must be cleaned up
    updateAsteroidDamageParticles(0.5)
    updateAsteroidDamageParticles(0.5)

    expect(gameScene.children.length).toBeLessThan(sceneChildCountWithBurst)
  })
})
