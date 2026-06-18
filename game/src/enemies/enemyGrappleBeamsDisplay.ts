import * as THREE from 'three'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'

// D70: makes ENEMY grapples visible, mirroring the player's grapple look (D63/D64/D66): a fuzzy ring
// around the grappling enemy + a fuzzy ring around the asteroid it's arcing, joined by a beam line.
// Shown only while the enemy is actually grappling (driven by EnemyShip.grappledAsteroid). Toxic-green
// so enemy grapples read distinctly from the player's cyan one. Pooled per enemy (no per-frame allocs).

const ENEMY_GRAPPLE_BEAM_COLOR = 0x88ff55
const ENEMY_GRAPPLE_RING_DIAMETER_METERS = 84 // encloses the (now-large) enemy hull
const ENEMY_GRAPPLE_ASTEROID_RING_RADIUS_MULTIPLE = 3 // ring diameter = asteroid radius × this (matches player)
const ENEMY_GRAPPLE_BEAM_RADIUS_METERS = 2.5
const CYLINDER_LOCAL_UP_AXIS = new THREE.Vector3(0, 1, 0)

function createFuzzyRingTexture(): THREE.CanvasTexture {
  const textureSizePixels = 128
  const ringCanvas = document.createElement('canvas')
  ringCanvas.width = textureSizePixels
  ringCanvas.height = textureSizePixels
  const drawContext = ringCanvas.getContext('2d') as CanvasRenderingContext2D
  const centerPixels = textureSizePixels / 2
  const radialGradient = drawContext.createRadialGradient(
    centerPixels, centerPixels, textureSizePixels * 0.4,
    centerPixels, centerPixels, textureSizePixels * 0.5,
  )
  radialGradient.addColorStop(0, 'rgba(136, 255, 85, 0)')
  radialGradient.addColorStop(0.5, 'rgba(136, 255, 85, 0.85)')
  radialGradient.addColorStop(1, 'rgba(136, 255, 85, 0)')
  drawContext.fillStyle = radialGradient
  drawContext.fillRect(0, 0, textureSizePixels, textureSizePixels)
  return new THREE.CanvasTexture(ringCanvas)
}

type EnemyGrappleBeamVisual = {
  enemyRing: THREE.Sprite
  asteroidRing: THREE.Sprite
  beamMesh: THREE.Mesh
}

export type EnemyGrappleBeamsDisplay = {
  updateEnemyGrappleBeams(enemyShips: readonly EnemyShip[]): void
}

const scratchBeamDelta = new THREE.Vector3()
const scratchBeamDirection = new THREE.Vector3()

export function createEnemyGrappleBeamsDisplay(gameScene: THREE.Scene): EnemyGrappleBeamsDisplay {
  // shared GPU resources across all enemy grapple visuals
  const sharedRingTexture = createFuzzyRingTexture()
  const sharedRingMaterial = new THREE.SpriteMaterial({
    map: sharedRingTexture,
    color: ENEMY_GRAPPLE_BEAM_COLOR,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const sharedBeamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true)
  const sharedBeamMaterial = new THREE.MeshBasicMaterial({
    color: ENEMY_GRAPPLE_BEAM_COLOR,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  const beamVisualsByEnemyShipId = new Map<number, EnemyGrappleBeamVisual>()

  function getOrCreateBeamVisual(enemyShipId: number): EnemyGrappleBeamVisual {
    let beamVisual = beamVisualsByEnemyShipId.get(enemyShipId)
    if (!beamVisual) {
      const enemyRing = new THREE.Sprite(sharedRingMaterial)
      enemyRing.scale.set(ENEMY_GRAPPLE_RING_DIAMETER_METERS, ENEMY_GRAPPLE_RING_DIAMETER_METERS, 1)
      const asteroidRing = new THREE.Sprite(sharedRingMaterial)
      const beamMesh = new THREE.Mesh(sharedBeamGeometry, sharedBeamMaterial)
      gameScene.add(enemyRing)
      gameScene.add(asteroidRing)
      gameScene.add(beamMesh)
      beamVisual = { enemyRing, asteroidRing, beamMesh }
      beamVisualsByEnemyShipId.set(enemyShipId, beamVisual)
    }
    return beamVisual
  }

  function setBeamVisualVisible(beamVisual: EnemyGrappleBeamVisual, isVisible: boolean): void {
    beamVisual.enemyRing.visible = isVisible
    beamVisual.asteroidRing.visible = isVisible
    beamVisual.beamMesh.visible = isVisible
  }

  return {
    updateEnemyGrappleBeams(enemyShips): void {
      const grapplingEnemyIds = new Set<number>()

      for (const enemyShip of enemyShips) {
        const grappledAsteroid = enemyShip.grappledAsteroid
        if (enemyShip.isDestroyed || !grappledAsteroid || grappledAsteroid.isDestroyed) continue
        grapplingEnemyIds.add(enemyShip.enemyShipId)

        const beamVisual = getOrCreateBeamVisual(enemyShip.enemyShipId)
        setBeamVisualVisible(beamVisual, true)

        beamVisual.enemyRing.position.copy(enemyShip.positionMeters)

        const asteroidRingDiameterMeters = grappledAsteroid.currentRadiusMeters * ENEMY_GRAPPLE_ASTEROID_RING_RADIUS_MULTIPLE
        beamVisual.asteroidRing.position.copy(grappledAsteroid.positionMeters)
        beamVisual.asteroidRing.scale.set(asteroidRingDiameterMeters, asteroidRingDiameterMeters, 1)

        // beam cylinder spanning enemy → asteroid (same technique as the player's tractor beam)
        scratchBeamDelta.subVectors(grappledAsteroid.positionMeters, enemyShip.positionMeters)
        const beamLengthMeters = scratchBeamDelta.length()
        if (beamLengthMeters > 1e-3) {
          beamVisual.beamMesh.position
            .copy(enemyShip.positionMeters)
            .addScaledVector(scratchBeamDelta, 0.5)
          beamVisual.beamMesh.scale.set(
            ENEMY_GRAPPLE_BEAM_RADIUS_METERS,
            beamLengthMeters,
            ENEMY_GRAPPLE_BEAM_RADIUS_METERS,
          )
          scratchBeamDirection.copy(scratchBeamDelta).divideScalar(beamLengthMeters)
          beamVisual.beamMesh.quaternion.setFromUnitVectors(CYLINDER_LOCAL_UP_AXIS, scratchBeamDirection)
        }
      }

      // hide/drop visuals for enemies no longer grappling (or gone)
      for (const [enemyShipId, beamVisual] of beamVisualsByEnemyShipId) {
        if (grapplingEnemyIds.has(enemyShipId)) continue
        gameScene.remove(beamVisual.enemyRing)
        gameScene.remove(beamVisual.asteroidRing)
        gameScene.remove(beamVisual.beamMesh)
        beamVisualsByEnemyShipId.delete(enemyShipId)
      }
    },
  }
}
