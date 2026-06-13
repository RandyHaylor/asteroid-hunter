import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  RingGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'
import { RADAR_DETECTION_RANGE_METERS, type RadarContactReading } from './radarSignatureTracker'
import './radarHud.css'

// R13: 3D spherical radar. D40: it is now a LARGE control that lives in the right control cluster
// (replacing the rotation joystick) and renders to its OWN canvas/renderer. Dragging on it steers
// the ship — drag offset from the grab point maps to pitch/yaw rate, exactly like the old joystick.
// R14/R16: fading last-seen dots, blinking red outline + "RECENT ACTIVE ENEMIES: n" label.

const VISIBLE_ENEMY_DOT_COLOR = 0xff3333
const LAST_SEEN_FADING_DOT_COLOR = 0xffcc33
const VISIBLE_FRIENDLY_DOT_COLOR = 0x44ff88 // D4: contract supports friendlies, none spawn in v1
const RADAR_SCOPE_BACKGROUND_COLOR = 0x06122e // dark navy inside the scope

// D40: drag offset (px) at which the steering input saturates to full deflection (±1)
const RADAR_DRAG_FULL_DEFLECTION_PIXELS = 70

export type RadarRotationDragInput = {
  /** -1..1, positive pitches the nose up (drag up) */
  pitchInput: number
  /** -1..1, positive yaws the nose right (drag right) */
  yawInput: number
  /** true while the player is actively dragging the radar to steer */
  isDragging: boolean
}

export type RadarSphereDisplay = {
  updateRadarDisplay(
    contactReadings: readonly RadarContactReading[],
    playerShipState: ShipRigidBodyState,
    recentActiveEnemyCount: number,
    unresolvedEnemiesPresent: boolean,
    nowSeconds: number,
  ): void
  /** render the radar to its own canvas (auto-sizes to the element) */
  renderRadar(): void
  /** D40: steering input from dragging the radar sphere */
  readRadarRotationInput(): RadarRotationDragInput
}

// scratch reused every frame — no per-frame allocations in the display path
const scratchInversePlayerOrientation = new Quaternion()

export function createRadarSphereDisplay(controlClusterElement: HTMLElement): RadarSphereDisplay {
  // ===== STEP 1: DOM — a big square scope (own canvas) + enemy-count label, in the control cluster =====
  const radarControlZone = document.createElement('div')
  radarControlZone.className = 'radarControlZone'

  const radarCanvas = document.createElement('canvas')
  radarCanvas.className = 'radarControlCanvas'
  radarControlZone.appendChild(radarCanvas)

  const enemyCountLabelElement = document.createElement('div')
  enemyCountLabelElement.className = 'radarEnemyCountLabel'
  enemyCountLabelElement.textContent = 'CONTACTS: 0'
  radarControlZone.appendChild(enemyCountLabelElement)

  controlClusterElement.appendChild(radarControlZone)

  // ===== STEP 2: drag-to-steer — grab-offset maps to pitch/yaw rate (replaces the joystick) =====
  let steeringPointerId: number | null = null
  let dragStartClientX = 0
  let dragStartClientY = 0
  let currentPitchInput = 0
  let currentYawInput = 0

  function updateSteeringFromPointer(pointerEvent: PointerEvent): void {
    const clampPixels = (value: number): number =>
      Math.max(-RADAR_DRAG_FULL_DEFLECTION_PIXELS, Math.min(RADAR_DRAG_FULL_DEFLECTION_PIXELS, value))
    const offsetXPixels = clampPixels(pointerEvent.clientX - dragStartClientX)
    const offsetYPixels = clampPixels(pointerEvent.clientY - dragStartClientY)
    // drag right = yaw right (+); drag up (negative screen Y) = pitch up (+) — matches the old stick
    currentYawInput = offsetXPixels / RADAR_DRAG_FULL_DEFLECTION_PIXELS
    currentPitchInput = -offsetYPixels / RADAR_DRAG_FULL_DEFLECTION_PIXELS
  }

  function releaseSteering(): void {
    steeringPointerId = null
    currentPitchInput = 0
    currentYawInput = 0
  }

  radarCanvas.addEventListener('pointerdown', (pointerEvent) => {
    steeringPointerId = pointerEvent.pointerId
    radarCanvas.setPointerCapture(pointerEvent.pointerId)
    dragStartClientX = pointerEvent.clientX
    dragStartClientY = pointerEvent.clientY
    currentPitchInput = 0
    currentYawInput = 0
  })
  radarCanvas.addEventListener('pointermove', (pointerEvent) => {
    if (pointerEvent.pointerId === steeringPointerId) updateSteeringFromPointer(pointerEvent)
  })
  radarCanvas.addEventListener('pointerup', releaseSteering)
  radarCanvas.addEventListener('pointercancel', releaseSteering)

  // ===== STEP 3: own renderer + private radar scene (wireframe sphere, disc, marker, tick) =====
  const radarRenderer = new WebGLRenderer({ canvas: radarCanvas, antialias: true })
  radarRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  radarRenderer.setClearColor(RADAR_SCOPE_BACKGROUND_COLOR, 1)

  const radarScene = new Scene()
  const radarCamera = new PerspectiveCamera(50, 1, 0.1, 10)
  radarCamera.position.set(0, 0.9, 2.1)
  radarCamera.lookAt(0, 0, 0)

  const wireframeSphere = new Mesh(
    new SphereGeometry(1, 16, 12),
    new MeshBasicMaterial({ color: 0x2adfdf, wireframe: true, transparent: true, opacity: 0.18 }),
  )
  radarScene.add(wireframeSphere)

  // D36: a horizontal reference disc through the sphere's center (ship's local horizontal plane)
  const equatorDiscFill = new Mesh(
    new CircleGeometry(1, 48),
    new MeshBasicMaterial({ color: 0x2adfdf, transparent: true, opacity: 0.08, side: DoubleSide, depthWrite: false }),
  )
  equatorDiscFill.rotation.x = -Math.PI / 2
  radarScene.add(equatorDiscFill)

  const equatorDiscRing = new Mesh(
    new RingGeometry(0.98, 1.0, 48),
    new MeshBasicMaterial({ color: 0x2adfdf, transparent: true, opacity: 0.5, side: DoubleSide }),
  )
  equatorDiscRing.rotation.x = -Math.PI / 2
  radarScene.add(equatorDiscRing)

  const playerCenterMarker = new Mesh(new SphereGeometry(0.05, 8, 6), new MeshBasicMaterial({ color: 0x7dffff }))
  radarScene.add(playerCenterMarker)

  // faint tick at -Z: "enemy ahead" always reads toward this mark regardless of world heading
  const forwardDirectionTick = new Mesh(
    new SphereGeometry(0.03, 6, 4),
    new MeshBasicMaterial({ color: 0x2adfdf, transparent: true, opacity: 0.55 }),
  )
  forwardDirectionTick.position.set(0, 0, -1)
  forwardDirectionTick.scale.set(0.7, 0.7, 3)
  radarScene.add(forwardDirectionTick)

  // pooled contact dots + their stem lines (created on demand, hidden when unused)
  const sharedContactDotGeometry = new SphereGeometry(0.045, 8, 6)
  const contactDotMeshPool: Mesh<SphereGeometry, MeshBasicMaterial>[] = []
  const contactStemLinePool: Line<BufferGeometry, LineBasicMaterial>[] = []

  function acquireContactDotMesh(poolIndex: number): Mesh<SphereGeometry, MeshBasicMaterial> {
    let dotMesh = contactDotMeshPool[poolIndex]
    if (!dotMesh) {
      dotMesh = new Mesh(sharedContactDotGeometry, new MeshBasicMaterial({ transparent: true, depthTest: false }))
      contactDotMeshPool[poolIndex] = dotMesh
      radarScene.add(dotMesh)
    }
    return dotMesh
  }

  function acquireContactStemLine(poolIndex: number): Line<BufferGeometry, LineBasicMaterial> {
    let stemLine = contactStemLinePool[poolIndex]
    if (!stemLine) {
      const stemGeometry = new BufferGeometry()
      stemGeometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3))
      stemLine = new Line(stemGeometry, new LineBasicMaterial({ transparent: true, depthTest: false }))
      contactStemLinePool[poolIndex] = stemLine
      radarScene.add(stemLine)
    }
    return stemLine
  }

  function updateRadarDisplay(
    contactReadings: readonly RadarContactReading[],
    playerShipState: ShipRigidBodyState,
    recentActiveEnemyCount: number,
    unresolvedEnemiesPresent: boolean,
    nowSeconds: number,
  ): void {
    // the sphere frame rotates WITH the player (R13) — transform contacts into the ship's local frame
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
      if (dotMesh.position.lengthSq() > 1) dotMesh.position.normalize()

      if (contactReading.contactState === 'lastSeenFading') {
        dotMesh.material.color.setHex(LAST_SEEN_FADING_DOT_COLOR)
        dotMesh.material.opacity = contactReading.fadeRemainingFraction
      } else {
        dotMesh.material.color.setHex(
          contactReading.contactType === 'friendly' ? VISIBLE_FRIENDLY_DOT_COLOR : VISIBLE_ENEMY_DOT_COLOR,
        )
        dotMesh.material.opacity = 1
      }

      const stemLine = acquireContactStemLine(readingIndex)
      stemLine.visible = true
      const stemPositions = stemLine.geometry.attributes.position as BufferAttribute
      stemPositions.setXYZ(0, dotMesh.position.x, dotMesh.position.y, dotMesh.position.z)
      stemPositions.setXYZ(1, dotMesh.position.x, 0, dotMesh.position.z)
      stemPositions.needsUpdate = true
      stemLine.material.color.copy(dotMesh.material.color)
      stemLine.material.opacity = dotMesh.material.opacity * 0.55
    }

    for (let poolIndex = contactReadings.length; poolIndex < contactDotMeshPool.length; poolIndex++) {
      contactDotMeshPool[poolIndex].visible = false
    }
    for (let poolIndex = contactReadings.length; poolIndex < contactStemLinePool.length; poolIndex++) {
      contactStemLinePool[poolIndex].visible = false
    }

    const playerMarkerPulseScale = 1 + 0.12 * Math.sin(nowSeconds * 4)
    playerCenterMarker.scale.setScalar(playerMarkerPulseScale)

    // HUD chrome — blinking red outline while unresolved enemies exist + count label (R16)
    radarControlZone.classList.toggle('radarOutlineBlinking', unresolvedEnemiesPresent)
    enemyCountLabelElement.textContent = `CONTACTS: ${recentActiveEnemyCount}`
    enemyCountLabelElement.classList.toggle('radarEnemyCountLabelAlert', recentActiveEnemyCount > 0)
  }

  let lastRenderedSizePixels = -1

  function renderRadar(): void {
    // auto-size the drawing buffer to the canvas's CSS size (square); only when it changes
    const cssSizePixels = radarCanvas.clientWidth
    if (cssSizePixels > 0 && cssSizePixels !== lastRenderedSizePixels) {
      lastRenderedSizePixels = cssSizePixels
      radarRenderer.setSize(cssSizePixels, cssSizePixels, false) // false: CSS controls display size
    }
    radarRenderer.render(radarScene, radarCamera)
  }

  function readRadarRotationInput(): RadarRotationDragInput {
    return {
      pitchInput: currentPitchInput,
      yawInput: currentYawInput,
      isDragging: steeringPointerId !== null,
    }
  }

  return { updateRadarDisplay, renderRadar, readRadarRotationInput }
}
