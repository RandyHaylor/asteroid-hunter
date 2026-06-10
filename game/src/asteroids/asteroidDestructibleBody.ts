import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'

// R12: asteroids shrink/deform under fire, losing chunks with simple particle effects.
// A5: implemented as radius shrink + particle chunk bursts (not true CSG carving).
// D11: enemy fire calls the same damage path, so cover degrades and forces relocation.

/** a chipped asteroid never shrinks below this fraction of its original radius */
const MINIMUM_RADIUS_FRACTION_OF_ORIGINAL = 0.4
/** debris counts for a chip hit vs the final destruction burst */
const CHIP_DEBRIS_PARTICLE_COUNT = 30
const DESTRUCTION_DEBRIS_PARTICLE_COUNT = 80
/** how long a debris burst lives before its geometry is disposed */
const DEBRIS_BURST_LIFETIME_SECONDS = 0.8
/** outward debris speeds — chips spit slower than the final blow-apart */
const CHIP_DEBRIS_SPEED_METERS_PER_SECOND = 14
const DESTRUCTION_DEBRIS_SPEED_METERS_PER_SECOND = 26

/** original radius/HP per asteroid, captured on first damage so shrink stays proportional */
type AsteroidUndamagedBaseline = {
  originalRadiusMeters: number
  originalHitPoints: number
}
const undamagedBaselinesByAsteroidId = new Map<number, AsteroidUndamagedBaseline>()

type RockDebrisBurst = {
  debrisPoints: Points
  debrisGeometry: BufferGeometry
  debrisMaterial: PointsMaterial
  /** one outward velocity per debris point, flattened xyz */
  debrisVelocities: Float32Array
  ageSeconds: number
  hostScene: Scene
}
const liveDebrisBursts: RockDebrisBurst[] = []

// scratch vector reused when seeding debris directions (avoids per-particle allocation)
const scratchDebrisDirection = new Vector3()

function spawnRockDebrisBurst(
  burstOriginWorld: Vector3,
  debrisParticleCount: number,
  debrisSpeedMetersPerSecond: number,
  gameScene: Scene,
): void {
  // STEP 1: seed every debris point at the impact origin with a random outward velocity
  const debrisPositions = new Float32Array(debrisParticleCount * 3)
  const debrisVelocities = new Float32Array(debrisParticleCount * 3)
  for (let particleIndex = 0; particleIndex < debrisParticleCount; particleIndex += 1) {
    const componentOffset = particleIndex * 3
    debrisPositions[componentOffset] = burstOriginWorld.x
    debrisPositions[componentOffset + 1] = burstOriginWorld.y
    debrisPositions[componentOffset + 2] = burstOriginWorld.z
    scratchDebrisDirection
      .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize()
      .multiplyScalar(debrisSpeedMetersPerSecond * (0.4 + Math.random() * 0.6))
    debrisVelocities[componentOffset] = scratchDebrisDirection.x
    debrisVelocities[componentOffset + 1] = scratchDebrisDirection.y
    debrisVelocities[componentOffset + 2] = scratchDebrisDirection.z
  }

  // STEP 2: build the Points object — rocky dust color, fades out over the burst lifetime
  const debrisGeometry = new BufferGeometry()
  debrisGeometry.setAttribute('position', new BufferAttribute(debrisPositions, 3))
  const debrisMaterial = new PointsMaterial({
    color: 0xb09878,
    size: 1.2,
    transparent: true,
    opacity: 1,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const debrisPoints = new Points(debrisGeometry, debrisMaterial)
  gameScene.add(debrisPoints)

  liveDebrisBursts.push({
    debrisPoints,
    debrisGeometry,
    debrisMaterial,
    debrisVelocities,
    ageSeconds: 0,
    hostScene: gameScene,
  })
}

export function applyWeaponDamageToAsteroid(
  asteroid: AsteroidBody,
  damageAmount: number,
  impactPointWorld: Vector3,
  gameScene: Scene,
): void {
  if (asteroid.isDestroyed) return

  // STEP 1: remember the undamaged baseline the first time this asteroid takes a hit
  let undamagedBaseline = undamagedBaselinesByAsteroidId.get(asteroid.asteroidId)
  if (!undamagedBaseline) {
    undamagedBaseline = {
      originalRadiusMeters: asteroid.currentRadiusMeters,
      originalHitPoints: asteroid.hitPointsRemaining,
    }
    undamagedBaselinesByAsteroidId.set(asteroid.asteroidId, undamagedBaseline)
  }

  // STEP 2: subtract HP
  asteroid.hitPointsRemaining -= damageAmount

  // STEP 3: destroyed — remove the rock and blow a big debris burst (R12)
  if (asteroid.hitPointsRemaining <= 0) {
    asteroid.hitPointsRemaining = 0
    asteroid.isDestroyed = true
    gameScene.remove(asteroid.renderObject)
    spawnRockDebrisBurst(
      impactPointWorld,
      DESTRUCTION_DEBRIS_PARTICLE_COUNT,
      DESTRUCTION_DEBRIS_SPEED_METERS_PER_SECOND,
      gameScene,
    )
    return
  }

  // STEP 4: still alive — shrink the rock proportionally to remaining HP, floored at 40% of
  // original so degraded cover still reads as a rock (A5); scale the mesh to match so cover
  // visibly erodes under enemy fire (D11)
  const remainingHitPointFraction = asteroid.hitPointsRemaining / undamagedBaseline.originalHitPoints
  const shrinkScale =
    MINIMUM_RADIUS_FRACTION_OF_ORIGINAL +
    (1 - MINIMUM_RADIUS_FRACTION_OF_ORIGINAL) * remainingHitPointFraction
  asteroid.currentRadiusMeters = undamagedBaseline.originalRadiusMeters * shrinkScale
  asteroid.renderObject.scale.setScalar(shrinkScale)

  // STEP 5: chip debris burst at the impact point
  spawnRockDebrisBurst(impactPointWorld, CHIP_DEBRIS_PARTICLE_COUNT, CHIP_DEBRIS_SPEED_METERS_PER_SECOND, gameScene)
}

export function updateAsteroidDamageParticles(deltaSeconds: number): void {
  for (let burstIndex = liveDebrisBursts.length - 1; burstIndex >= 0; burstIndex -= 1) {
    const burst = liveDebrisBursts[burstIndex]
    burst.ageSeconds += deltaSeconds

    // STEP 1: expired — remove from scene and dispose GPU resources, then drop from the live list
    if (burst.ageSeconds >= DEBRIS_BURST_LIFETIME_SECONDS) {
      burst.hostScene.remove(burst.debrisPoints)
      burst.debrisGeometry.dispose()
      burst.debrisMaterial.dispose()
      liveDebrisBursts.splice(burstIndex, 1)
      continue
    }

    // STEP 2: fly each debris point outward along its seeded velocity
    const debrisPositions = burst.debrisGeometry.getAttribute('position') as BufferAttribute
    const positionValues = debrisPositions.array as Float32Array
    for (let componentIndex = 0; componentIndex < positionValues.length; componentIndex += 1) {
      positionValues[componentIndex] += burst.debrisVelocities[componentIndex] * deltaSeconds
    }
    debrisPositions.needsUpdate = true

    // STEP 3: fade the burst out over its lifetime
    burst.debrisMaterial.opacity = 1 - burst.ageSeconds / DEBRIS_BURST_LIFETIME_SECONDS
  }
}
