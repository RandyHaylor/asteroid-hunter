import {
  BufferAttribute,
  Color,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Vector3,
} from 'three'
import type { AsteroidBody, AsteroidSizeClass } from '../gameSimulation/gameWorldTypes'

// D10: bounded sphere play area with procedurally scattered asteroids.
// R6: only 'large' asteroids are cover-eligible — the spawner tags size classes for that.
// R10: medium/small asteroids carry drift velocity and proportionate mass so they physically react.

export const PLAY_AREA_RADIUS_METERS = 800

/** asteroids scatter inside this fraction of the play radius, clear of the soft edge */
const FIELD_SCATTER_RADIUS_FRACTION = 0.9
/** keep an empty bubble around the origin so the player spawns in open space */
const PLAYER_SPAWN_CLEAR_BUBBLE_RADIUS_METERS = 80
/** per-vertex radial jitter fraction for irregular rock silhouettes (A1: procedural low-poly art) */
const ROCK_VERTEX_RADIAL_JITTER_FRACTION = 0.18
/** max random drift speed for medium/small asteroids (R10) */
const MAX_DRIFT_SPEED_METERS_PER_SECOND = 2
/** slow tumble so the field feels alive without affecting physics */
const MAX_TUMBLE_RATE_RADIANS_PER_SECOND = 0.15

type AsteroidSizeClassSpawnPlan = {
  sizeClass: AsteroidSizeClass
  spawnCount: number
  minRadiusMeters: number
  maxRadiusMeters: number
  hitPoints: number
}

const asteroidFieldSpawnPlans: AsteroidSizeClassSpawnPlan[] = [
  { sizeClass: 'large', spawnCount: 22, minRadiusMeters: 16, maxRadiusMeters: 30, hitPoints: 300 },
  { sizeClass: 'medium', spawnCount: 40, minRadiusMeters: 6, maxRadiusMeters: 12, hitPoints: 120 },
  { sizeClass: 'small', spawnCount: 60, minRadiusMeters: 2.5, maxRadiusMeters: 5, hitPoints: 50 },
]

/** large rocks are effectively immovable anchors for cover; mass scales with radius */
const LARGE_ASTEROID_MASS_KG_PER_RADIUS_METER = 5e6 / 23

function randomNumberBetween(minValue: number, maxValue: number): number {
  return minValue + Math.random() * (maxValue - minValue)
}

/** uniform random point inside a sphere of the given radius (cube-root density correction) */
function randomPointInsideSphere(sphereRadiusMeters: number, outPoint: Vector3): Vector3 {
  outPoint
    .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
    .normalize()
    .multiplyScalar(sphereRadiusMeters * Math.cbrt(Math.random()))
  return outPoint
}

function createJaggedRockMesh(rockRadiusMeters: number): Mesh {
  // IcosahedronGeometry(radius, 1) gives a chunky low-poly ball; radial vertex jitter makes each rock unique
  const rockGeometry = new IcosahedronGeometry(rockRadiusMeters, 1)
  const vertexPositions = rockGeometry.getAttribute('position') as BufferAttribute
  const jitteredVertex = new Vector3()
  for (let vertexIndex = 0; vertexIndex < vertexPositions.count; vertexIndex += 1) {
    jitteredVertex.fromBufferAttribute(vertexPositions, vertexIndex)
    const radialJitterScale =
      1 + randomNumberBetween(-ROCK_VERTEX_RADIAL_JITTER_FRACTION, ROCK_VERTEX_RADIAL_JITTER_FRACTION)
    jitteredVertex.multiplyScalar(radialJitterScale)
    vertexPositions.setXYZ(vertexIndex, jitteredVertex.x, jitteredVertex.y, jitteredVertex.z)
  }
  rockGeometry.computeVertexNormals()

  // rocky grey-brown, flat-shaded so the low-poly facets read clearly under lighting (R1, A1)
  const rockMaterial = new MeshStandardMaterial({
    color: new Color().setHSL(0.07, randomNumberBetween(0.1, 0.25), randomNumberBetween(0.28, 0.42)),
    flatShading: true,
    roughness: 0.95,
    metalness: 0.05,
  })

  const rockMesh = new Mesh(rockGeometry, rockMaterial)
  rockMesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
  return rockMesh
}

let nextAsteroidId = 1

/** per-asteroid tumble rates, keyed by asteroidId (visual only, not part of the physics contract) */
const tumbleRatesByAsteroidId = new Map<number, Vector3>()

export function spawnAsteroidFieldInBoundedSphere(gameScene: Scene): AsteroidBody[] {
  const spawnedAsteroids: AsteroidBody[] = []
  const scatterRadiusMeters = PLAY_AREA_RADIUS_METERS * FIELD_SCATTER_RADIUS_FRACTION

  for (const spawnPlan of asteroidFieldSpawnPlans) {
    for (let spawnIndex = 0; spawnIndex < spawnPlan.spawnCount; spawnIndex += 1) {
      // STEP 1: pick a uniform position inside the field, rejecting the player-spawn clear bubble (D10)
      const spawnPosition = new Vector3()
      do {
        randomPointInsideSphere(scatterRadiusMeters, spawnPosition)
      } while (spawnPosition.length() < PLAYER_SPAWN_CLEAR_BUBBLE_RADIUS_METERS)

      // STEP 2: size, mass, and drift by class — large rocks are static anchors, medium/small drift (R10)
      const rockRadiusMeters = randomNumberBetween(spawnPlan.minRadiusMeters, spawnPlan.maxRadiusMeters)
      const isLargeAnchorRock = spawnPlan.sizeClass === 'large'
      const driftVelocity = new Vector3()
      if (!isLargeAnchorRock) {
        randomPointInsideSphere(MAX_DRIFT_SPEED_METERS_PER_SECOND, driftVelocity)
      }
      const massKg = isLargeAnchorRock
        ? LARGE_ASTEROID_MASS_KG_PER_RADIUS_METER * rockRadiusMeters
        : // rough rock density ~2500 kg/m³ on a sphere volume, plenty for believable drift reactions
          2500 * (4 / 3) * Math.PI * rockRadiusMeters ** 3

      // STEP 3: build the render mesh and the simulation body
      const rockMesh = createJaggedRockMesh(rockRadiusMeters)
      rockMesh.position.copy(spawnPosition)
      gameScene.add(rockMesh)

      const asteroidId = nextAsteroidId
      nextAsteroidId += 1
      spawnedAsteroids.push({
        asteroidId,
        sizeClass: spawnPlan.sizeClass,
        positionMeters: spawnPosition,
        velocityMetersPerSecond: driftVelocity,
        currentRadiusMeters: rockRadiusMeters,
        massKg,
        hitPointsRemaining: spawnPlan.hitPoints,
        isDestroyed: false,
        renderObject: rockMesh,
      })

      tumbleRatesByAsteroidId.set(
        asteroidId,
        new Vector3(
          randomNumberBetween(-MAX_TUMBLE_RATE_RADIANS_PER_SECOND, MAX_TUMBLE_RATE_RADIANS_PER_SECOND),
          randomNumberBetween(-MAX_TUMBLE_RATE_RADIANS_PER_SECOND, MAX_TUMBLE_RATE_RADIANS_PER_SECOND),
          randomNumberBetween(-MAX_TUMBLE_RATE_RADIANS_PER_SECOND, MAX_TUMBLE_RATE_RADIANS_PER_SECOND),
        ),
      )
    }
  }

  return spawnedAsteroids
}

export function updateDriftingAsteroids(asteroids: AsteroidBody[], deltaSeconds: number): void {
  for (const asteroid of asteroids) {
    if (asteroid.isDestroyed) continue

    // STEP 1: integrate drift for medium/small rocks (R10); large rocks hold position as cover anchors
    if (asteroid.sizeClass !== 'large') {
      asteroid.positionMeters.addScaledVector(asteroid.velocityMetersPerSecond, deltaSeconds)
    }

    // STEP 2: slow visual tumble for every rock so the field feels alive
    const tumbleRate = tumbleRatesByAsteroidId.get(asteroid.asteroidId)
    if (tumbleRate) {
      asteroid.renderObject.rotation.x += tumbleRate.x * deltaSeconds
      asteroid.renderObject.rotation.y += tumbleRate.y * deltaSeconds
      asteroid.renderObject.rotation.z += tumbleRate.z * deltaSeconds
    }

    // STEP 3: the simulation position is authoritative — sync the render mesh to it
    asteroid.renderObject.position.copy(asteroid.positionMeters)
  }
}
