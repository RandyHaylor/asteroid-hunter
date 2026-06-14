import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'
import { autoAimConfig } from '../weapons/noseConeAutoAim'
import { RADAR_DETECTION_RANGE_METERS, type RadarContactReading } from './radarSignatureTracker'
import './radarHud.css'

// R13: 3D spherical radar, a LARGE control in the view (D40/D41), rendered to its OWN canvas.
// D42: it is a TRACKBALL — dragging rotates the radar's own orientation directly (1:1, no damping);
// the ship's heading then slews toward that orientation on its own (handled in main.ts). When not
// dragging the radar mirrors the ship. Enemy dots drop a vertical CYLINDER stem to the center disc.
// R14/R16: fading last-seen dots, blinking red outline + contacts label.

const VISIBLE_ENEMY_DOT_COLOR = 0xff3333
const LAST_SEEN_FADING_DOT_COLOR = 0xffcc33
const VISIBLE_FRIENDLY_DOT_COLOR = 0x44ff88 // D4: contract supports friendlies, none spawn in v1
const RADAR_SCOPE_BACKGROUND_COLOR = 0x06122e // dark navy inside the scope

// D42: how far (radians) the radar orientation turns per pixel dragged
const RADAR_DRAG_RADIANS_PER_PIXEL = 0.011 // D46: more sensitive radar rotation
const CONTACT_STEM_CYLINDER_RADIUS = 0.009 // thin vertical line from each dot to the center disc (D44)

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
  /** D42: true while the player is dragging the radar to steer */
  isSteeringDrag(): boolean
  /** D42: the orientation the player has dragged the radar to — the ship slews toward this */
  getCommandedOrientation(): Quaternion
  /** D42: keep the radar mirroring the ship while the player isn't dragging */
  syncCommandedOrientationToShip(shipOrientation: Quaternion): void
}

// scratch reused every frame — no per-frame allocations in the display path
const scratchInverseCommandedOrientation = new Quaternion()

// D48: flat green wedge on the horizontal disc representing the auto-aim cone — a triangle fan from
// the center toward the forward tick (-Z), spanning ±coneHalfAngle, lying in the y=0 plane.
function buildAimConeWedgeGeometry(coneHalfAngleRadians: number): BufferGeometry {
  const wedgeRadius = 0.98
  const segmentCount = 14
  const vertexPositions: number[] = []
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
    const angleStart = -coneHalfAngleRadians + 2 * coneHalfAngleRadians * (segmentIndex / segmentCount)
    const angleEnd = -coneHalfAngleRadians + 2 * coneHalfAngleRadians * ((segmentIndex + 1) / segmentCount)
    vertexPositions.push(0, 0, 0)
    vertexPositions.push(Math.sin(angleStart) * wedgeRadius, 0, -Math.cos(angleStart) * wedgeRadius)
    vertexPositions.push(Math.sin(angleEnd) * wedgeRadius, 0, -Math.cos(angleEnd) * wedgeRadius)
  }
  const wedgeGeometry = new BufferGeometry()
  wedgeGeometry.setAttribute('position', new BufferAttribute(new Float32Array(vertexPositions), 3))
  return wedgeGeometry
}

export function createRadarSphereDisplay(controlClusterElement: HTMLElement): RadarSphereDisplay {
  // ===== STEP 1: DOM — a big square scope (own canvas) + contacts label =====
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

  // ===== STEP 2: D42 trackball — dragging rotates radarCommandedOrientation directly (no damping) =====
  const radarCommandedOrientation = new Quaternion()
  const scratchDragYawRotation = new Quaternion()
  const scratchDragPitchRotation = new Quaternion()
  const radarLocalUpAxis = new Vector3(0, 1, 0)
  const radarLocalRightAxis = new Vector3(1, 0, 0)

  let steeringPointerId: number | null = null
  let lastPointerXPixels = 0
  let lastPointerYPixels = 0

  radarCanvas.addEventListener('pointerdown', (pointerEvent) => {
    steeringPointerId = pointerEvent.pointerId
    radarCanvas.setPointerCapture(pointerEvent.pointerId)
    lastPointerXPixels = pointerEvent.clientX
    lastPointerYPixels = pointerEvent.clientY
  })
  radarCanvas.addEventListener('pointermove', (pointerEvent) => {
    if (pointerEvent.pointerId !== steeringPointerId) return
    const dragDeltaXPixels = pointerEvent.clientX - lastPointerXPixels
    const dragDeltaYPixels = pointerEvent.clientY - lastPointerYPixels
    lastPointerXPixels = pointerEvent.clientX
    lastPointerYPixels = pointerEvent.clientY
    // drag right = yaw right (negative around local up); drag up = pitch up (negative around right)
    scratchDragYawRotation.setFromAxisAngle(radarLocalUpAxis, -dragDeltaXPixels * RADAR_DRAG_RADIANS_PER_PIXEL)
    scratchDragPitchRotation.setFromAxisAngle(radarLocalRightAxis, -dragDeltaYPixels * RADAR_DRAG_RADIANS_PER_PIXEL)
    radarCommandedOrientation.multiply(scratchDragYawRotation).multiply(scratchDragPitchRotation).normalize()
  })
  function releaseSteering(): void {
    steeringPointerId = null
  }
  radarCanvas.addEventListener('pointerup', releaseSteering)
  radarCanvas.addEventListener('pointercancel', releaseSteering)

  // ===== STEP 3: own renderer + private radar scene =====
  const radarRenderer = new WebGLRenderer({ canvas: radarCanvas, antialias: true })
  radarRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  radarRenderer.setClearColor(RADAR_SCOPE_BACKGROUND_COLOR, 1)

  const radarScene = new Scene()
  const radarCamera = new PerspectiveCamera(50, 1, 0.1, 10)
  radarCamera.position.set(0, 0.9, 2.1)
  radarCamera.lookAt(0, 0, 0)

  // D44: the OUTER SURFACE rotates with the player's heading (set each frame) so the rotation is
  // visible (the wireframe's longitude/latitude lines spinning carry the motion — D48 removed the
  // pole-dot marker per request).
  const wireframeSphere = new Mesh(
    new SphereGeometry(1, 16, 12),
    new MeshBasicMaterial({ color: 0x2adfdf, wireframe: true, transparent: true, opacity: 0.3 }),
  )
  radarScene.add(wireframeSphere)

  // D48: the auto-aim cone (D6) drawn flat on the horizontal disc — a green wedge from center toward
  // the forward tick (-Z), spanning ±coneHalfAngle. Static (the cone is your fixed forward aim).
  const aimConeWedgeMesh = new Mesh(
    buildAimConeWedgeGeometry(autoAimConfig.coneHalfAngleRadians),
    new MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false }),
  )
  radarScene.add(aimConeWedgeMesh)

  // D36: horizontal reference disc through the sphere's center (ship's local horizontal plane)
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

  const forwardDirectionTick = new Mesh(
    new SphereGeometry(0.03, 6, 4),
    new MeshBasicMaterial({ color: 0x2adfdf, transparent: true, opacity: 0.55 }),
  )
  forwardDirectionTick.position.set(0, 0, -1)
  forwardDirectionTick.scale.set(0.7, 0.7, 3)
  radarScene.add(forwardDirectionTick)

  // pooled contact dots + their vertical stem cylinders (created on demand, hidden when unused)
  const sharedContactDotGeometry = new SphereGeometry(0.045, 8, 6)
  // unit cylinder along Y, height 1, centered — scaled per contact to the stem length
  const sharedStemCylinderGeometry = new CylinderGeometry(
    CONTACT_STEM_CYLINDER_RADIUS,
    CONTACT_STEM_CYLINDER_RADIUS,
    1,
    6,
  )
  const contactDotMeshPool: Mesh<SphereGeometry, MeshBasicMaterial>[] = []
  const contactStemCylinderPool: Mesh<CylinderGeometry, MeshBasicMaterial>[] = []

  function acquireContactDotMesh(poolIndex: number): Mesh<SphereGeometry, MeshBasicMaterial> {
    let dotMesh = contactDotMeshPool[poolIndex]
    if (!dotMesh) {
      dotMesh = new Mesh(sharedContactDotGeometry, new MeshBasicMaterial({ transparent: true, depthTest: false }))
      contactDotMeshPool[poolIndex] = dotMesh
      radarScene.add(dotMesh)
    }
    return dotMesh
  }

  function acquireContactStemCylinder(poolIndex: number): Mesh<CylinderGeometry, MeshBasicMaterial> {
    let stemCylinder = contactStemCylinderPool[poolIndex]
    if (!stemCylinder) {
      stemCylinder = new Mesh(
        sharedStemCylinderGeometry,
        new MeshBasicMaterial({ transparent: true, depthTest: false }),
      )
      contactStemCylinderPool[poolIndex] = stemCylinder
      radarScene.add(stemCylinder)
    }
    return stemCylinder
  }

  function updateRadarDisplay(
    contactReadings: readonly RadarContactReading[],
    playerShipState: ShipRigidBodyState,
    recentActiveEnemyCount: number,
    unresolvedEnemiesPresent: boolean,
    nowSeconds: number,
  ): void {
    // D42: the radar frame follows the (player-dragged) COMMANDED orientation, not the ship's lagged
    // one — transform contacts into that frame: inverse(commanded) × (contactPos − playerPos)
    scratchInverseCommandedOrientation.copy(radarCommandedOrientation).invert()

    // D44: spin the outer sphere surface to match (the contacts ride this same frame), so the
    // rotation is visible. The center disc + forward tick stay fixed as your heading reference.
    wireframeSphere.quaternion.copy(scratchInverseCommandedOrientation)

    for (let readingIndex = 0; readingIndex < contactReadings.length; readingIndex++) {
      const contactReading = contactReadings[readingIndex]
      const dotMesh = acquireContactDotMesh(readingIndex)
      dotMesh.visible = true

      dotMesh.position
        .copy(contactReading.positionMeters)
        .sub(playerShipState.positionMeters)
        .applyQuaternion(scratchInverseCommandedOrientation)
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

      // D42: a visible vertical cylinder stem from the dot down/up to the equator disc (x, 0, z)
      const stemCylinder = acquireContactStemCylinder(readingIndex)
      const stemLengthOnAxis = Math.abs(dotMesh.position.y)
      if (stemLengthOnAxis < 0.001) {
        stemCylinder.visible = false
      } else {
        stemCylinder.visible = true
        stemCylinder.position.set(dotMesh.position.x, dotMesh.position.y / 2, dotMesh.position.z)
        stemCylinder.scale.set(1, stemLengthOnAxis, 1)
        stemCylinder.material.color.copy(dotMesh.material.color)
        stemCylinder.material.opacity = dotMesh.material.opacity * 0.75
      }
    }

    for (let poolIndex = contactReadings.length; poolIndex < contactDotMeshPool.length; poolIndex++) {
      contactDotMeshPool[poolIndex].visible = false
    }
    for (let poolIndex = contactReadings.length; poolIndex < contactStemCylinderPool.length; poolIndex++) {
      contactStemCylinderPool[poolIndex].visible = false
    }

    const playerMarkerPulseScale = 1 + 0.12 * Math.sin(nowSeconds * 4)
    playerCenterMarker.scale.setScalar(playerMarkerPulseScale)

    radarControlZone.classList.toggle('radarOutlineBlinking', unresolvedEnemiesPresent)
    enemyCountLabelElement.textContent = `CONTACTS: ${recentActiveEnemyCount}`
    enemyCountLabelElement.classList.toggle('radarEnemyCountLabelAlert', recentActiveEnemyCount > 0)
  }

  let lastRenderedSizePixels = -1

  function renderRadar(): void {
    const cssSizePixels = radarCanvas.clientWidth
    if (cssSizePixels > 0 && cssSizePixels !== lastRenderedSizePixels) {
      lastRenderedSizePixels = cssSizePixels
      radarRenderer.setSize(cssSizePixels, cssSizePixels, false)
    }
    radarRenderer.render(radarScene, radarCamera)
  }

  return {
    updateRadarDisplay,
    renderRadar,
    isSteeringDrag: () => steeringPointerId !== null,
    getCommandedOrientation: () => radarCommandedOrientation,
    syncCommandedOrientationToShip: (shipOrientation: Quaternion) => {
      radarCommandedOrientation.copy(shipOrientation)
    },
  }
}
