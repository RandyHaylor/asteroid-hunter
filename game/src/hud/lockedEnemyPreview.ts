import * as THREE from 'three'
import './lockedEnemyPreview.css'
import type { EnemyShip } from '../gameSimulation/gameWorldTypes'
import { createEnemyShipMesh } from '../enemies/enemyShipMesh'
import { ENEMY_SHIP_MAX_HULL_POINTS, ENEMY_SHIP_MAX_SHIELD_POINTS } from '../enemies/enemyShipDamage'

// D67: a small live 3D preview of the LOCKED enemy's ship model, sitting under the THRUST button,
// with its shield + hull levels shown as mini bars beneath it. Hidden when nothing is locked. Uses
// its own tiny WebGL renderer so it never disturbs the main scene; the model slowly spins to read as
// a live readout.

const PREVIEW_CANVAS_PIXELS = 104
const PREVIEW_MODEL_SPIN_RADIANS_PER_SECOND = 0.8

export type LockedEnemyPreview = {
  /** lockedEnemy = null hides the panel; elapsedSeconds drives the idle spin */
  updateLockedEnemyPreview(lockedEnemy: EnemyShip | null, elapsedSeconds: number): void
}

export function createLockedEnemyPreview(parentElement: HTMLElement): LockedEnemyPreview {
  const panel = document.createElement('div')
  panel.className = 'lockedEnemyPreviewPanel'

  const label = document.createElement('div')
  label.className = 'lockedEnemyPreviewLabel'
  label.textContent = 'LOCKED'
  panel.appendChild(label)

  const previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  previewRenderer.setSize(PREVIEW_CANVAS_PIXELS, PREVIEW_CANVAS_PIXELS)
  previewRenderer.domElement.className = 'lockedEnemyPreviewCanvas'
  panel.appendChild(previewRenderer.domElement)

  // mini shield (blue) + hull (red) bars under the model
  function buildMiniBar(fillClassName: string): HTMLDivElement {
    const track = document.createElement('div')
    track.className = 'lockedEnemyPreviewBar'
    const fill = document.createElement('div')
    fill.className = `lockedEnemyPreviewBarFill ${fillClassName}`
    track.appendChild(fill)
    panel.appendChild(track)
    return fill
  }
  const shieldFill = buildMiniBar('lockedEnemyPreviewShieldFill')
  const hullFill = buildMiniBar('lockedEnemyPreviewHullFill')

  parentElement.appendChild(panel)

  // tiny isolated scene: model + lights + a framing camera
  const previewScene = new THREE.Scene()
  const previewCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000)
  previewCamera.position.set(0, 6, 26)
  previewCamera.lookAt(0, 0, 0)
  previewScene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1)
  keyLight.position.set(4, 8, 10)
  previewScene.add(keyLight)

  const previewModel = createEnemyShipMesh()
  previewScene.add(previewModel)

  let isPanelVisible = false

  return {
    updateLockedEnemyPreview(lockedEnemy, elapsedSeconds): void {
      if (lockedEnemy === null) {
        if (isPanelVisible) {
          panel.classList.remove('lockedEnemyPreviewPanelVisible')
          isPanelVisible = false
        }
        return
      }
      if (!isPanelVisible) {
        panel.classList.add('lockedEnemyPreviewPanelVisible')
        isPanelVisible = true
      }

      const shieldFraction = Math.max(0, Math.min(1, lockedEnemy.shieldPointsRemaining / ENEMY_SHIP_MAX_SHIELD_POINTS))
      const hullFraction = Math.max(0, Math.min(1, lockedEnemy.hitPointsRemaining / ENEMY_SHIP_MAX_HULL_POINTS))
      shieldFill.style.width = `${shieldFraction * 100}%`
      hullFill.style.width = `${hullFraction * 100}%`

      previewModel.rotation.y = elapsedSeconds * PREVIEW_MODEL_SPIN_RADIANS_PER_SECOND
      previewRenderer.render(previewScene, previewCamera)
    },
  }
}
