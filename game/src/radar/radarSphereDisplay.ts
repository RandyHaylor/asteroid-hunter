import {
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector2,
  Vector4,
  type WebGLRenderer,
} from 'three'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'
import { RADAR_DETECTION_RANGE_METERS, type RadarContactReading } from './radarSignatureTracker'
import './radarHud.css'

// R13: inset 3D spherical radar in the top-right corner, rendered with the MAIN WebGLRenderer
// via scissor+viewport into a private scene — no second renderer.
// R14/R16: fading last-seen dots, blinking red outline + "RECENT ACTIVE ENEMIES: n" label.

const RADAR_INSET_PREFERRED_SIZE_PIXELS = 220
/** on narrow screens the inset shrinks to a fraction of the viewport width */
const RADAR_INSET_MAX_VIEWPORT_WIDTH_FRACTION = 0.3
const RADAR_INSET_CORNER_MARGIN_PIXELS = 14

const VISIBLE_ENEMY_DOT_COLOR = 0xff3333
const LAST_SEEN_FADING_DOT_COLOR = 0xffcc33
const VISIBLE_FRIENDLY_DOT_COLOR = 0x44ff88 // D4: contract supports friendlies, none spawn in v1
const RADAR_INSET_CLEAR_COLOR = 0x06122e // dark translucent navy inside the inset
const RADAR_INSET_CLEAR_ALPHA = 0.6

export type RadarSphereDisplay = {
  updateRadarDisplay(
    contactReadings: readonly RadarContactReading[],
    playerShipState: ShipRigidBodyState,
    recentActiveEnemyCount: number,
    unresolvedEnemiesPresent: boolean,
    nowSeconds: number,
  ): void
  renderRadarInset(webglRenderer: WebGLRenderer): void
}

// scratch objects reused every frame — no per-frame allocations in the display path
const scratchInversePlayerOrientation = new Quaternion()
const scratchRendererSize = new Vector2()
const scratchSavedViewport = new Vector4()
const scratchSavedScissor = new Vector4()
const scratchSavedClearColor = new Color()

export function createRadarSphereDisplay(hudOverlayRoot: HTMLElement): RadarSphereDisplay {
  // STEP 1: DOM overlay — circular outline ring + enemy count label, pointer-events none (R16)
  const radarCornerElement = document.createElement('div')
  radarCornerElement.className = 'radarHudCorner'
  const radarOutlineRingElement = document.createElement('div')
  radarOutlineRingElement.className = 'radarOutlineRing'
  const enemyCountLabelElement = document.createElement('div')
  enemyCountLabelElement.className = 'radarEnemyCountLabel'
  enemyCountLabelElement.textContent = 'RECENT ACTIVE ENEMIES: 0'
  radarCornerElement.appendChild(radarOutlineRingElement)
  radarCornerElement.appendChild(enemyCountLabelElement)
  hudOverlayRoot.appendChild(radarCornerElement)

  // STEP 2: private radar scene — wireframe sphere, player center marker, forward tick (R13)
  const radarScene = new Scene()
  const radarCamera = new PerspectiveCamera(50, 1, 0.1, 10)
  radarCamera.position.set(0, 0.9, 2.1)
  radarCamera.lookAt(0, 0, 0)

  const wireframeSphere = new Mesh(
    new SphereGeometry(1, 16, 12),
    new MeshBasicMaterial({ color: 0x2adfdf, wireframe: true, transparent: true, opacity: 0.22 }),
  )
  radarScene.add(wireframeSphere)

  const playerCenterMarker = new Mesh(
    new SphereGeometry(0.05, 8, 6),
    new MeshBasicMaterial({ color: 0x7dffff }),
  )
  radarScene.add(playerCenterMarker)

  // faint tick at -Z: "enemy ahead" always reads toward this mark regardless of world heading
  const forwardDirectionTick = new Mesh(
    new SphereGeometry(0.03, 6, 4),
    new MeshBasicMaterial({ color: 0x2adfdf, transparent: true, opacity: 0.55 }),
  )
  forwardDirectionTick.position.set(0, 0, -1)
  forwardDirectionTick.scale.set(0.7, 0.7, 3) // stretched along the look axis so it reads as a tick
  radarScene.add(forwardDirectionTick)

  // STEP 3: pooled contact dot meshes — created on demand, hidden when unused
  const sharedContactDotGeometry = new SphereGeometry(0.045, 8, 6)
  const contactDotMeshPool: Mesh<SphereGeometry, MeshBasicMaterial>[] = []

  function acquireContactDotMesh(poolIndex: number): Mesh<SphereGeometry, MeshBasicMaterial> {
    let dotMesh = contactDotMeshPool[poolIndex]
    if (!dotMesh) {
      dotMesh = new Mesh(
        sharedContactDotGeometry,
        new MeshBasicMaterial({ transparent: true, depthTest: false }),
      )
      contactDotMeshPool[poolIndex] = dotMesh
      radarScene.add(dotMesh)
    }
    return dotMesh
  }

  function updateRadarDisplay(
    contactReadings: readonly RadarContactReading[],
    playerShipState: ShipRigidBodyState,
    recentActiveEnemyCount: number,
    unresolvedEnemiesPresent: boolean,
    nowSeconds: number,
  ): void {
    // STEP 1: the sphere frame rotates WITH the player (R13) — transform every contact into the
    // ship's local frame: inverse(orientation) × (contactPosition − playerPosition)
    scratchInversePlayerOrientation.copy(playerShipState.orientation).invert()

    for (let readingIndex = 0; readingIndex < contactReadings.length; readingIndex++) {
      const contactReading = contactReadings[readingIndex]
      const dotMesh = acquireContactDotMesh(readingIndex)
      dotMesh.visible = true

      dotMesh.position
        .copy(contactReading.positionMeters)
        .sub(playerShipState.positionMeters)
        .applyQuaternion(scratchInversePlayerOrientation)
        .multiplyScalar(1 / RADAR_DETECTION_RANGE_METERS)
      if (dotMesh.position.lengthSq() > 1) dotMesh.position.normalize() // clamp to the unit sphere

      // STEP 2: dot styling — red visible enemy, yellow fading last-seen with decaying opacity (R14)
      if (contactReading.contactState === 'lastSeenFading') {
        dotMesh.material.color.setHex(LAST_SEEN_FADING_DOT_COLOR)
        dotMesh.material.opacity = contactReading.fadeRemainingFraction
      } else {
        dotMesh.material.color.setHex(
          contactReading.contactType === 'friendly' ? VISIBLE_FRIENDLY_DOT_COLOR : VISIBLE_ENEMY_DOT_COLOR,
        )
        dotMesh.material.opacity = 1
      }
    }

    // STEP 3: hide leftover pooled dots beyond the live reading count
    for (let poolIndex = contactReadings.length; poolIndex < contactDotMeshPool.length; poolIndex++) {
      contactDotMeshPool[poolIndex].visible = false
    }

    // STEP 4: gentle pulse on the player marker so the radar reads as live
    const playerMarkerPulseScale = 1 + 0.12 * Math.sin(nowSeconds * 4)
    playerCenterMarker.scale.setScalar(playerMarkerPulseScale)

    // STEP 5: HUD chrome — blinking red outline while unresolved enemies exist + count label (R16)
    radarOutlineRingElement.classList.toggle('radarOutlineBlinking', unresolvedEnemiesPresent)
    enemyCountLabelElement.textContent = `RECENT ACTIVE ENEMIES: ${recentActiveEnemyCount}`
    enemyCountLabelElement.classList.toggle('radarEnemyCountLabelAlert', recentActiveEnemyCount > 0)
  }

  // cached so DOM styles are only rewritten when the inset size actually changes
  let lastAppliedInsetSizePixels = -1

  function renderRadarInset(webglRenderer: WebGLRenderer): void {
    // STEP 1: size the square inset from the renderer's CSS-pixel size (smaller on narrow screens)
    webglRenderer.getSize(scratchRendererSize)
    const insetSizePixels = Math.min(
      RADAR_INSET_PREFERRED_SIZE_PIXELS,
      Math.round(scratchRendererSize.x * RADAR_INSET_MAX_VIEWPORT_WIDTH_FRACTION),
    )
    const insetLeftPixels = scratchRendererSize.x - insetSizePixels - RADAR_INSET_CORNER_MARGIN_PIXELS
    // viewport origin is bottom-left, so the TOP-right corner sits at height − inset − margin
    const insetBottomPixels = scratchRendererSize.y - insetSizePixels - RADAR_INSET_CORNER_MARGIN_PIXELS

    if (insetSizePixels !== lastAppliedInsetSizePixels) {
      lastAppliedInsetSizePixels = insetSizePixels
      radarCornerElement.style.width = `${insetSizePixels}px`
      radarCornerElement.style.height = `${insetSizePixels}px`
      radarCornerElement.style.top = `${RADAR_INSET_CORNER_MARGIN_PIXELS}px`
      radarCornerElement.style.right = `${RADAR_INSET_CORNER_MARGIN_PIXELS}px`
    }

    // STEP 2: save renderer state so the main scene's next frame is unaffected
    webglRenderer.getViewport(scratchSavedViewport)
    webglRenderer.getScissor(scratchSavedScissor)
    const savedScissorTestEnabled = webglRenderer.getScissorTest()
    const savedAutoClear = webglRenderer.autoClear
    webglRenderer.getClearColor(scratchSavedClearColor)
    const savedClearAlpha = webglRenderer.getClearAlpha()

    // STEP 3: scissor+viewport to the top-right square; clear color+depth INSIDE the inset only
    webglRenderer.autoClear = false
    webglRenderer.setScissorTest(true)
    webglRenderer.setViewport(insetLeftPixels, insetBottomPixels, insetSizePixels, insetSizePixels)
    webglRenderer.setScissor(insetLeftPixels, insetBottomPixels, insetSizePixels, insetSizePixels)
    webglRenderer.setClearColor(RADAR_INSET_CLEAR_COLOR, RADAR_INSET_CLEAR_ALPHA)
    webglRenderer.clear(true, true, false)

    webglRenderer.render(radarScene, radarCamera)

    // STEP 4: restore renderer state and disable the scissor test
    webglRenderer.setViewport(scratchSavedViewport)
    webglRenderer.setScissor(scratchSavedScissor)
    webglRenderer.setScissorTest(savedScissorTestEnabled)
    webglRenderer.setClearColor(scratchSavedClearColor, savedClearAlpha)
    webglRenderer.autoClear = savedAutoClear
  }

  return { updateRadarDisplay, renderRadarInset }
}
