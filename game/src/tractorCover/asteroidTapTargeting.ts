import { Raycaster, Sphere, Vector2, Vector3 } from 'three'
import type { Camera } from 'three'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'

// R4/R6: resolve a screen tap to the large asteroid it landed on (only large asteroids are tappable).
// Ray-vs-bounding-sphere against positionMeters/currentRadiusMeters — analytic spheres are more
// reliable than mesh raycasts against jittered/deformed asteroid geometry (R12).

// scratch objects reused every call to avoid per-tap allocations
const sharedTapRaycaster = new Raycaster()
const scratchTapPointNdc = new Vector2()
const scratchAsteroidBoundingSphere = new Sphere()
const scratchRayHitPoint = new Vector3()

export function findTappedLargeAsteroid(
  normalizedDeviceX: number,
  normalizedDeviceY: number,
  playerViewCamera: Camera,
  asteroids: readonly AsteroidBody[],
): AsteroidBody | null {
  // STEP 1: cast a ray from the camera through the tap point (NDC -1..1)
  scratchTapPointNdc.set(normalizedDeviceX, normalizedDeviceY)
  sharedTapRaycaster.setFromCamera(scratchTapPointNdc, playerViewCamera)

  // STEP 2: intersect only alive LARGE asteroids (R6); keep the hit nearest to the camera
  let nearestTappedAsteroid: AsteroidBody | null = null
  let nearestHitDistanceMeters = Infinity
  for (const asteroid of asteroids) {
    if (asteroid.isDestroyed || asteroid.sizeClass !== 'large') continue

    scratchAsteroidBoundingSphere.set(asteroid.positionMeters, asteroid.currentRadiusMeters)
    const rayHitPoint = sharedTapRaycaster.ray.intersectSphere(
      scratchAsteroidBoundingSphere,
      scratchRayHitPoint,
    )
    if (rayHitPoint === null) continue

    const hitDistanceMeters = rayHitPoint.distanceTo(sharedTapRaycaster.ray.origin)
    if (hitDistanceMeters < nearestHitDistanceMeters) {
      nearestHitDistanceMeters = hitDistanceMeters
      nearestTappedAsteroid = asteroid
    }
  }

  return nearestTappedAsteroid
}
