import { IcosahedronGeometry, Mesh, MeshBasicMaterial } from 'three'
import type { Vector3 } from 'three'
import type { AsteroidBody, EnemyShip } from '../gameSimulation/gameWorldTypes'
import { evaluateCoverQualityForAsteroid } from './coverQualityEvaluator'
import type { CoverQuality } from './coverQualityEvaluator'

// R6/R8: tappable (large) asteroids wear a wireframe grid overlay whose color reports cover quality.
// Integration calls updateCoverGridOverlayColors a few times per second, not every frame.

const coverQualityGridColors: Record<CoverQuality, number> = {
  fullCover: 0x44ddff, // cyan — full cover available
  exposedToLongRangeEnemies: 0xffcc33, // yellow — long-range missile enemies can still see the cover point
  exposedToShortRangeEnemies: 0xff3333, // red — short-range laser enemies can see the cover point
}

const OVERLAY_RADIUS_SCALE = 1.06
const OVERLAY_OPACITY = 0.35

// one shared unit-sphere wireframe geometry; each overlay gets its own material for independent color
const sharedUnitGridGeometry = new IcosahedronGeometry(1, 1)
const overlayMeshByAsteroidId = new Map<number, Mesh<IcosahedronGeometry, MeshBasicMaterial>>()

function fitOverlayToAsteroidRadius(
  overlayMesh: Mesh<IcosahedronGeometry, MeshBasicMaterial>,
  asteroid: AsteroidBody,
): void {
  // overlay geometry is a unit sphere; counteract any parent render scaling so the grid always
  // sits at 1.06× the asteroid's current radius (tracks R12 shrinking too)
  const parentRenderScale = asteroid.renderObject.scale.x || 1
  overlayMesh.scale.setScalar((asteroid.currentRadiusMeters * OVERLAY_RADIUS_SCALE) / parentRenderScale)
}

export function createCoverGridOverlaysForLargeAsteroids(largeAsteroids: readonly AsteroidBody[]): void {
  for (const asteroid of largeAsteroids) {
    // R6: only large asteroids are tappable/cover-eligible
    if (asteroid.sizeClass !== 'large') continue
    if (overlayMeshByAsteroidId.has(asteroid.asteroidId)) continue

    const gridMaterial = new MeshBasicMaterial({
      color: coverQualityGridColors.fullCover,
      wireframe: true,
      transparent: true,
      opacity: OVERLAY_OPACITY,
      depthWrite: false,
    })
    const overlayMesh = new Mesh(sharedUnitGridGeometry, gridMaterial)
    fitOverlayToAsteroidRadius(overlayMesh, asteroid)
    asteroid.renderObject.add(overlayMesh)
    overlayMeshByAsteroidId.set(asteroid.asteroidId, overlayMesh)
  }
}

export function updateCoverGridOverlayColors(
  largeAsteroids: readonly AsteroidBody[],
  enemyShips: readonly EnemyShip[],
  playerPositionMeters: Vector3,
  playerFacingDirection: Vector3,
  allAsteroids: readonly AsteroidBody[],
  tractorGrabMaxRangeMeters: number,
): void {
  for (const asteroid of largeAsteroids) {
    const overlayMesh = overlayMeshByAsteroidId.get(asteroid.asteroidId)
    if (!overlayMesh) continue

    // destroyed asteroids offer no cover — hide their grid
    if (asteroid.isDestroyed) {
      overlayMesh.visible = false
      continue
    }

    // D16: the grid marks "tappable" — asteroids beyond tractor grab range show no grid
    const distanceToAsteroidSurfaceMeters =
      playerPositionMeters.distanceTo(asteroid.positionMeters) - asteroid.currentRadiusMeters
    if (distanceToAsteroidSurfaceMeters > tractorGrabMaxRangeMeters) {
      overlayMesh.visible = false
      continue
    }

    overlayMesh.visible = true
    fitOverlayToAsteroidRadius(overlayMesh, asteroid)
    const coverQuality = evaluateCoverQualityForAsteroid(
      asteroid,
      enemyShips,
      playerPositionMeters,
      playerFacingDirection,
      allAsteroids,
    )
    overlayMesh.material.color.setHex(coverQualityGridColors[coverQuality])
  }
}
