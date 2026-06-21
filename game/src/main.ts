import './style.css'
import * as THREE from 'three'
import { playerShipBaseFlightStats, playerEngagementRange } from './shipStats'
import {
  createShipRigidBodyStateAtRest,
  getShipForwardDirection,
  stepShipFlightSimulation,
} from './gameSimulation/newtonianShipPhysics'
import {
  type AsteroidBody,
  type EnemyShip,
  type GameWorld,
} from './gameSimulation/gameWorldTypes'
import { easeShipIntoFieldEdgeOrbit } from './gameSimulation/boundedPlayAreaSoftEdge'
import { spawnAsteroidFieldInBoundedSphere, updateDriftingAsteroids } from './asteroids/asteroidFieldSpawner'
import {
  applyWeaponDamageToAsteroid,
  updateAsteroidDamageParticles,
} from './asteroids/asteroidDestructibleBody'
import {
  enemyBaseLaserStats,
  enemyBaseMissileStats,
  playerBaseLaserStats,
  playerBaseMissileStats,
} from './weapons/weaponStats'
import { selectAutoAimTargetInNoseCone } from './weapons/noseConeAutoAim'
import { isShipAlignedForLaserFire } from './weapons/laserAlignmentGate'
import { createGameAudioSystem } from './audio/proceduralGameAudio'
import { createEnemyTargetRings } from './hud/enemyTargetRings'
import { createAimingReticle } from './hud/aimingReticle'
import { createShipWeaponCrosshair } from './hud/shipWeaponCrosshair'
import { createSunLensFlare } from './hud/sunLensFlare'
import { createProceduralSpaceNebulaTexture } from './scene/proceduralSpaceSkybox'
import { createPowerUpSelectionOverlay } from './hud/powerUpSelectionOverlay'
import {
  ALL_POWER_UP_DEFINITIONS,
  selectDistinctPowerUps,
  type PowerUpDefinition,
} from './upgrades/powerUpDefinitions'
import { computeLeadAimDirection } from './weapons/targetLeadPrediction'
import { createLaserVolleySystem } from './weapons/laserFire'
import { createMissileVolleySystem } from './weapons/missileFire'
import { createViewEdgeStatusIndicators } from './hud/viewEdgeStatusIndicators'
import { createShipTrajectoryAndSpeedIndicator } from './hud/shipTrajectoryAndSpeedIndicator'
import { createGameSettingsMenu } from './hud/gameSettingsMenu'
import { createLockedEnemyPreview } from './hud/lockedEnemyPreview'
import { createCockpitFrameOverlay } from './hud/cockpitFrameOverlay'
import {
  createEnemyFireIntent,
  createEnemyShip,
  updateEnemyShipBehavior,
  type EnemyFireIntent,
} from './enemies/enemyAlienShipBehavior'
import { applyWeaponDamageToEnemyShip } from './enemies/enemyShipDamage'
import { composeWaveEnemyBehaviorTiers } from './enemies/waveEnemyComposition'
import { createEnemyConditionBarsDisplay } from './enemies/enemyConditionBarsDisplay'
import { createEnemyGrappleBeamsDisplay } from './enemies/enemyGrappleBeamsDisplay'
import { createPlayerShipCondition } from './player/playerShipCondition'
import { createPlayerConditionDisplay } from './hud/playerConditionDisplay'
import { createRadarSignatureTracker } from './radar/radarSignatureTracker'
import { createRadarSphereDisplay } from './radar/radarSphereDisplay'
import { createGrappleOrbitController } from './grappleOrbit/grappleOrbitController'
import {
  findNearestAvoidanceAsteroid,
  computeAvoidanceProximityFraction,
  applyAvoidancePushback,
} from './grappleOrbit/playerAsteroidAvoidance'
import { shipAutopilotSettings } from './autopilot/shipAutopilotSettings'
import { createShipAutopilotSettingsPanel } from './autopilot/shipAutopilotSettingsPanel'
import {
  computeAutopilotIntent,
  createAutopilotIntent,
  type AutopilotContext,
} from './autopilot/shipAutopilot'
import { createAsteroidOrbitIcons } from './radar/asteroidOrbitIcons'
import { createTouchFlightControls } from './hud/touchFlightControls'
import { createPlayerCameraRig } from './hud/cameraChaseAndCockpit'
import { createPlayerShipMesh, updatePlayerEngineExhaust } from './player/playerShipMesh'

// ===== STEP 1: renderer, scene, camera bootstrap =====

const gameRenderCanvas = document.getElementById('gameRenderCanvas') as HTMLCanvasElement
// D35: over-the-view HUD (sized to the square) vs controls (placed in the letterbox margins)
const viewHudOverlay = document.getElementById('viewHudOverlay') as HTMLElement
const controlsOverlay = document.getElementById('controlsOverlay') as HTMLElement

const webglRenderer = new THREE.WebGLRenderer({ canvas: gameRenderCanvas, antialias: true })
webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const gameScene = new THREE.Scene()
// D30: an exaggerated colored nebula skybox (procedural, no asset files) replaces the near-black void
gameScene.background = createProceduralSpaceNebulaTexture()

// D48: the ship view is 4:3 (wider). The radar stays SQUARE. Layout per orientation:
//  - LANDSCAPE: wide right-aligned block = ship-view (4:3, left) + radar (square, right); buttons in
//    the left strip (split: throttle/strafe upper, lower cluster below).
//  - PORTRAIT: ship-view (4:3) on top; radar square on the right of the lower area, button column left.
// currentShipView{Width,Height}Pixels feed the screen-space HUD projection (edge markers + flare).
const SHIP_VIEW_ASPECT_RATIO = 4 / 3
// D91: the controls moved INTO the radar square's dead corners, so the landscape layout no longer
// reserves a right-side control strip — the ship view + radar fill the full width (no empty gap).
const LANDSCAPE_LEFT_STRIP_MIN_PIXELS = 0
const PORTRAIT_SHIP_VIEW_HEIGHT_FRACTION = 0.42
const PORTRAIT_BUTTON_COLUMN_MIN_PIXELS = 132 // min width reserved for the button column left of the radar
const REGION_GAP_PIXELS = 8

const playerViewCamera = new THREE.PerspectiveCamera(70, SHIP_VIEW_ASPECT_RATIO, 0.1, 8000)
let currentShipViewWidthPixels = Math.min(window.innerWidth, window.innerHeight)
let currentShipViewHeightPixels = currentShipViewWidthPixels

function applyFixedBoxStyle(
  element: HTMLElement,
  leftPixels: number,
  topPixels: number,
  widthPixels: number,
  heightPixels: number,
): void {
  element.style.position = 'fixed'
  element.style.left = `${leftPixels}px`
  element.style.top = `${topPixels}px`
  element.style.width = `${widthPixels}px`
  element.style.height = `${heightPixels}px`
  element.style.right = 'auto'
  element.style.bottom = 'auto'
}

function layoutGameRegions(): void {
  const viewportWidthPixels = window.innerWidth
  const viewportHeightPixels = window.innerHeight
  const isPortrait = viewportHeightPixels >= viewportWidthPixels
  let shipViewWidthPixels: number
  let shipViewHeightPixels: number

  if (!isPortrait) {
    // ship-view (4:3) + radar (square) share a height; right-aligned block, left strip = buttons.
    // total block width = shipHeight*aspect + shipHeight = shipHeight*(aspect+1)
    const blockHeightPixels = Math.min(
      viewportHeightPixels,
      Math.floor((viewportWidthPixels - LANDSCAPE_LEFT_STRIP_MIN_PIXELS) / (SHIP_VIEW_ASPECT_RATIO + 1)),
    )
    shipViewHeightPixels = blockHeightPixels
    shipViewWidthPixels = Math.floor(blockHeightPixels * SHIP_VIEW_ASPECT_RATIO)
    const radarSidePixels = blockHeightPixels
    // D77: ship view LEFT, radar in the middle, ALL controls in a strip on the RIGHT (was: controls
    // on the left). This keeps every control (manual + AI) on one side so the AI overlay is consistent.
    const controlStripWidthPixels = viewportWidthPixels - shipViewWidthPixels - radarSidePixels
    const blockTopPixels = Math.floor((viewportHeightPixels - blockHeightPixels) / 2)
    for (const viewElement of [gameRenderCanvas, viewHudOverlay]) {
      applyFixedBoxStyle(viewElement, 0, blockTopPixels, shipViewWidthPixels, shipViewHeightPixels)
    }
    applyFixedBoxStyle(radarRegion, shipViewWidthPixels, blockTopPixels, radarSidePixels, radarSidePixels)
    const controlStripLeftPixels = shipViewWidthPixels + radarSidePixels
    const stripSplitPixels = Math.floor(viewportHeightPixels * 0.6)
    applyFixedBoxStyle(leftControlCluster, controlStripLeftPixels, 0, controlStripWidthPixels, stripSplitPixels)
    applyFixedBoxStyle(
      rightControlCluster,
      controlStripLeftPixels,
      stripSplitPixels,
      controlStripWidthPixels,
      viewportHeightPixels - stripSplitPixels,
    )
  } else {
    // ship-view (4:3) on top; radar square on the right of the lower area, button column to its left
    shipViewHeightPixels = Math.min(
      Math.floor(viewportHeightPixels * PORTRAIT_SHIP_VIEW_HEIGHT_FRACTION),
      Math.floor(viewportWidthPixels / SHIP_VIEW_ASPECT_RATIO),
    )
    shipViewWidthPixels = Math.floor(shipViewHeightPixels * SHIP_VIEW_ASPECT_RATIO)
    const shipLeftPixels = Math.floor((viewportWidthPixels - shipViewWidthPixels) / 2)
    for (const viewElement of [gameRenderCanvas, viewHudOverlay]) {
      applyFixedBoxStyle(viewElement, shipLeftPixels, 0, shipViewWidthPixels, shipViewHeightPixels)
    }

    const lowerAreaTopPixels = shipViewHeightPixels + REGION_GAP_PIXELS
    const lowerAreaHeightPixels = Math.max(0, viewportHeightPixels - lowerAreaTopPixels)
    const radarSquareSizePixels = Math.max(
      0,
      Math.min(lowerAreaHeightPixels, viewportWidthPixels - PORTRAIT_BUTTON_COLUMN_MIN_PIXELS),
    )
    const radarTopPixels = lowerAreaTopPixels + Math.floor((lowerAreaHeightPixels - radarSquareSizePixels) / 2)
    applyFixedBoxStyle(radarRegion, viewportWidthPixels - radarSquareSizePixels, radarTopPixels, radarSquareSizePixels, radarSquareSizePixels)

    const buttonColumnWidthPixels = viewportWidthPixels - radarSquareSizePixels
    const clusterSplitHeightPixels = Math.floor(lowerAreaHeightPixels * 0.6)
    applyFixedBoxStyle(leftControlCluster, 0, lowerAreaTopPixels, buttonColumnWidthPixels, clusterSplitHeightPixels)
    applyFixedBoxStyle(
      rightControlCluster,
      0,
      lowerAreaTopPixels + clusterSplitHeightPixels,
      buttonColumnWidthPixels,
      lowerAreaHeightPixels - clusterSplitHeightPixels,
    )
  }

  currentShipViewWidthPixels = shipViewWidthPixels
  currentShipViewHeightPixels = shipViewHeightPixels
  webglRenderer.setSize(shipViewWidthPixels, shipViewHeightPixels)
  playerViewCamera.aspect = shipViewWidthPixels / shipViewHeightPixels
  playerViewCamera.updateProjectionMatrix()
}
// NOTE: layoutGameRegions() is first called AFTER the control clusters + radar region are created.

// ===== STEP 2: single light source — a nearby sun with hard directional light (R1, user direction) =====

const SUN_DIRECTION_FROM_ORIGIN = new THREE.Vector3(0.55, 0.35, 0.4).normalize()

const nearbySunLight = new THREE.DirectionalLight(0xfff2dd, 3.2)
nearbySunLight.position.copy(SUN_DIRECTION_FROM_ORIGIN).multiplyScalar(1000)
gameScene.add(nearbySunLight)

// D30: a faint hemisphere fill (sky tint above, dark below) lifts the formerly black shadow side
// so ships/asteroids read against the brighter nebula. Deliberately weak so the sun stays dominant
// (a softening of D13's strict single-light rule, at the user's request to lighten the scene).
const softSkyFillLight = new THREE.HemisphereLight(0x6a86c0, 0x16203a, 0.275)
gameScene.add(softSkyFillLight)

// the visible sun disk — emissive, so it needs no other light
const visibleSunDisk = new THREE.Mesh(
  new THREE.SphereGeometry(120, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff0c8 }),
)
visibleSunDisk.position.copy(SUN_DIRECTION_FROM_ORIGIN).multiplyScalar(4500)
gameScene.add(visibleSunDisk)

// ===== STEP 3: world state, player systems, HUD =====

const gameWorld: GameWorld = {
  asteroids: spawnAsteroidFieldInBoundedSphere(gameScene),
  enemyShips: [],
}

const playerShipState = createShipRigidBodyStateAtRest()
// D88: start the game already at FULL max speed moving forward (identity facing = -Z), so the player
// begins in motion rather than at 0 m/s in the low-speed warning state. (Wave-restart re-applies this
// in resetPlayerShipForWaveRestart; this covers the initial boot, which never calls that.)
playerShipState.velocityMetersPerSecond.set(0, 0, -playerShipBaseFlightStats.cruiseSpeedMetersPerSecond)
const playerShipMesh = createPlayerShipMesh()
gameScene.add(playerShipMesh)

// D64: a fuzzy glowing ring texture (transparent centre, soft bright band, faded edge)
function createFuzzyRingTexture(): THREE.CanvasTexture {
  const textureSizePixels = 128
  const ringCanvas = document.createElement('canvas')
  ringCanvas.width = textureSizePixels
  ringCanvas.height = textureSizePixels
  const drawContext = ringCanvas.getContext('2d') as CanvasRenderingContext2D
  const centerPixels = textureSizePixels / 2
  const radialGradient = drawContext.createRadialGradient(
    centerPixels,
    centerPixels,
    textureSizePixels * 0.3,
    centerPixels,
    centerPixels,
    textureSizePixels * 0.5,
  )
  radialGradient.addColorStop(0, 'rgba(120, 224, 255, 0)')
  radialGradient.addColorStop(0.55, 'rgba(120, 224, 255, 0.85)')
  radialGradient.addColorStop(0.8, 'rgba(170, 238, 255, 0.35)')
  radialGradient.addColorStop(1, 'rgba(120, 224, 255, 0)')
  drawContext.fillStyle = radialGradient
  drawContext.fillRect(0, 0, textureSizePixels, textureSizePixels)
  return new THREE.CanvasTexture(ringCanvas)
}

// D63/D64: a thick (cylinder) tractor beam from the ship to the orbited asteroid, plus a fuzzy ring
// around that asteroid. Both shown only while latched.
const TRACTOR_BEAM_RADIUS_METERS = 0.8 // D66: halved
const CYLINDER_LOCAL_UP_AXIS = new THREE.Vector3(0, 1, 0)
const tractorBeamMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x66ddff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
tractorBeamMesh.visible = false
gameScene.add(tractorBeamMesh)

const orbitTargetFuzzyRing = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createFuzzyRingTexture(),
    color: 0xccf6ff, // D77: brighter (was 0x88e0ff) — the selected-asteroid highlight was hard to see
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
orbitTargetFuzzyRing.visible = false
gameScene.add(orbitTargetFuzzyRing)

const scratchTractorBeamDelta = new THREE.Vector3()
const scratchTractorBeamDirection = new THREE.Vector3()

// D66: a much THINNER fuzzy ring that always glows around the player ship (same idea as the asteroid
// ring, tighter band).
function createThinFuzzyRingTexture(): THREE.CanvasTexture {
  const textureSizePixels = 128
  const ringCanvas = document.createElement('canvas')
  ringCanvas.width = textureSizePixels
  ringCanvas.height = textureSizePixels
  const drawContext = ringCanvas.getContext('2d') as CanvasRenderingContext2D
  const centerPixels = textureSizePixels / 2
  const radialGradient = drawContext.createRadialGradient(
    centerPixels,
    centerPixels,
    textureSizePixels * 0.42,
    centerPixels,
    centerPixels,
    textureSizePixels * 0.5,
  )
  radialGradient.addColorStop(0, 'rgba(159, 220, 255, 0)')
  radialGradient.addColorStop(0.5, 'rgba(159, 220, 255, 0.8)')
  radialGradient.addColorStop(1, 'rgba(159, 220, 255, 0)')
  drawContext.fillStyle = radialGradient
  drawContext.fillRect(0, 0, textureSizePixels, textureSizePixels)
  return new THREE.CanvasTexture(ringCanvas)
}
const SHIP_FUZZY_RING_DIAMETER_METERS = 11
const shipFuzzyRing = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createThinFuzzyRingTexture(),
    color: 0x9fdcff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
shipFuzzyRing.scale.set(SHIP_FUZZY_RING_DIAMETER_METERS, SHIP_FUZZY_RING_DIAMETER_METERS, 1)
shipFuzzyRing.visible = false // D67: shown while orbiting; D71: also while avoidance is engaged
gameScene.add(shipFuzzyRing)

// D71: collision-avoidance deflection visuals — a fuzzy WHITE ring on the approaching asteroid + a
// white beam to the player ring, both fading in by proximity. Distinct white (vs the cyan orbit grapple).
function createWhiteFuzzyRingTexture(): THREE.CanvasTexture {
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
  radialGradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
  radialGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)')
  radialGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  drawContext.fillStyle = radialGradient
  drawContext.fillRect(0, 0, textureSizePixels, textureSizePixels)
  return new THREE.CanvasTexture(ringCanvas)
}
const avoidanceDeflectionRing = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createWhiteFuzzyRingTexture(),
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
avoidanceDeflectionRing.visible = false
gameScene.add(avoidanceDeflectionRing)
const avoidanceDeflectionBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, 8, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
avoidanceDeflectionBeam.visible = false
gameScene.add(avoidanceDeflectionBeam)
const AVOIDANCE_DEFLECTION_BEAM_RADIUS_METERS = 0.8
const scratchAvoidanceBeamDelta = new THREE.Vector3()
const scratchAvoidanceBeamDirection = new THREE.Vector3()
// D71: render state set each sim step by updatePlayerMovement, consumed by the render sync
let avoidanceTargetAsteroid: import('./gameSimulation/gameWorldTypes').AsteroidBody | null = null
let avoidanceProximityFraction = 0

const playerShipCondition = createPlayerShipCondition()
// D35/D37: interactive controls go in two flex clusters inside the margin overlay (left + right);
// informational HUD goes over the square view. Flex sizing keeps controls from ever overlapping.
const leftControlCluster = document.createElement('div')
leftControlCluster.className = 'controlClusterLeft'
controlsOverlay.appendChild(leftControlCluster)
const rightControlCluster = document.createElement('div')
rightControlCluster.className = 'controlClusterRight'
controlsOverlay.appendChild(rightControlCluster)

const flightControls = createTouchFlightControls(leftControlCluster)
// D47/D66: weapons are always on (no fire buttons). Left-edge status: a vertical speed-upgrade level
// bar plus a bottom-left missile charge meter (laser bar removed in D66).
const viewEdgeStatusIndicators = createViewEdgeStatusIndicators(viewHudOverlay)
// D88: below this speed the ship is "too slow" — tractor/grapple cut out, the speed bar flashes red,
// and the low-speed warning banner shows. Speed is hard to rebuild (weak thrust), so this matters.
const LOW_SPEED_THRESHOLD_METERS_PER_SECOND = 50
// D88: tractor/grapple is DISABLED while below the low-speed threshold (driver-agnostic — applies to the
// player and the AI identically, keeping "AI = zero game difference"). Latching is blocked; an existing
// orbit holds constant speed so it never drops into this state mid-orbit.
function isShipMovingFastEnoughToGrapple(): boolean {
  return playerShipState.velocityMetersPerSecond.length() >= LOW_SPEED_THRESHOLD_METERS_PER_SECOND
}
// D86: bottom-right trajectory arrow + horizontal speed bar (full at cruise) + live m/s readout
const scratchTravelDirectionInViewSpace = new THREE.Vector3()
const shipTrajectoryAndSpeedIndicator = createShipTrajectoryAndSpeedIndicator(
  viewHudOverlay,
  scratchTravelDirectionInViewSpace,
)
// D67: live 3D preview of the locked enemy (with its shield/hull) sits under the THRUST button
// D91: the right control strip is gone (controls live in the radar corners now), so the locked-enemy
// preview overlays the ship view (top-left) instead of sitting in the strip.
const lockedEnemyPreview = createLockedEnemyPreview(viewHudOverlay)
// D48: cockpit canopy frame overlay (shown only in cockpit view)
const cockpitFrameOverlay = createCockpitFrameOverlay(viewHudOverlay)
const playerCameraRig = createPlayerCameraRig(playerViewCamera)
const playerConditionDisplay = createPlayerConditionDisplay(viewHudOverlay)
const radarSignatureTracker = createRadarSignatureTracker()
// D40/D41: the big radar is its own JS-positioned square region (landscape: right half of the wide
// view; portrait: under the ship view). Dragging it steers the ship.
const radarRegion = document.createElement('div')
radarRegion.className = 'radarRegion'
controlsOverlay.appendChild(radarRegion)
const radarSphereDisplay = createRadarSphereDisplay(radarRegion)
// D60: grapple/slingshot — latch state machine; the radar rim icons (below) drive it, and it
// overrides the ship's position/velocity along the orbit while latched (facing/camera unaffected).
const grappleOrbitController = createGrappleOrbitController()
// D60: tappable rim icons for in-range asteroids; tapping one drives the latch controller
const asteroidOrbitIcons = createAsteroidOrbitIcons(
  radarSphereDisplay.getControlZoneElement(),
  (asteroid) => {
    if (!isShipMovingFastEnoughToGrapple()) return // D88: tractor/grapple disabled at low speed
    grappleOrbitController.onAsteroidIconPressed(asteroid, playerShipState, performance.now() / 1000)
  },
  (asteroid) => grappleOrbitController.onAsteroidIconReleased(asteroid, performance.now() / 1000),
)
// D91: tuck the THRUST button into the radar square's bottom-RIGHT dead corner (outside the radar
// circle), instead of a separate side cluster. The AI button goes in the bottom-LEFT corner (below).
radarRegion.appendChild(flightControls.thrustButtonElement)

// D74: AUTOPILOT ("AI mode") — an "AI" toggle button + state. Default OFF (manual flight). When active,
// the autopilot drives the commanded heading + thrust + evasion-orbit from shipAutopilotSettings.
let autopilotModeActive = false
let autopilotIsForcedThisWave = false // D74: wave-3 forced-AI level locks manual flight out (set in wave logic)
const autopilotIntent = createAutopilotIntent()
let autopilotWasEvadingLastFrame = false
let lastPlayerDamageAtSeconds = Number.NEGATIVE_INFINITY
const AUTOPILOT_RECENT_DAMAGE_WINDOW_SECONDS = 1.5
// D82: the effective thrust this frame (manual OR autopilot, and not while orbiting) — drives the thruster visuals
let currentEffectiveThrustActive = false

// D75/D77: the AI settings overlay sits over the radar (radar visible behind), with a caret toggle +
// an EXIT AI PILOT button. Exiting is blocked during a forced-AI wave (wave 3).
const autopilotSettingsPanel = createShipAutopilotSettingsPanel(radarRegion, () => {
  if (autopilotIsForcedThisWave) return
  setAutopilotModeActive(false)
})
// D77: while AI mode is on, the manual flight controls are unavailable — a slight translucent overlay
// over the left control cluster blocks + visibly dims them (the widgets stay visible behind it).
const manualControlsBlockOverlay = document.createElement('div')
manualControlsBlockOverlay.className = 'manualControlsBlockOverlay'
leftControlCluster.appendChild(manualControlsBlockOverlay)

// D79: AI-mode FREE-LOOK — drag the ship view to orbit the camera around the ship (look around). This
// rotates the CAMERA ONLY (composed onto the commanded heading); the ship's aim/auto-aim are untouched,
// and the aim reticle stays anchored to the real aim point (it does NOT move with this look-around).
let autopilotFreeLookYawRadians = 0
let autopilotFreeLookPitchRadians = 0
const AUTOPILOT_FREE_LOOK_RADIANS_PER_PIXEL = 0.005
const AUTOPILOT_FREE_LOOK_MAX_PITCH_RADIANS = (80 * Math.PI) / 180
const autopilotFreeLookOffsetQuaternion = new THREE.Quaternion()
const scratchFreeLookYawQuaternion = new THREE.Quaternion()
const scratchFreeLookPitchQuaternion = new THREE.Quaternion()
const FREE_LOOK_LOCAL_UP_AXIS = new THREE.Vector3(0, 1, 0)
const FREE_LOOK_LOCAL_RIGHT_AXIS = new THREE.Vector3(1, 0, 0)
function refreshAutopilotFreeLookOffsetQuaternion(): void {
  scratchFreeLookYawQuaternion.setFromAxisAngle(FREE_LOOK_LOCAL_UP_AXIS, autopilotFreeLookYawRadians)
  scratchFreeLookPitchQuaternion.setFromAxisAngle(FREE_LOOK_LOCAL_RIGHT_AXIS, autopilotFreeLookPitchRadians)
  autopilotFreeLookOffsetQuaternion.copy(scratchFreeLookYawQuaternion).multiply(scratchFreeLookPitchQuaternion)
}
function resetAutopilotFreeLook(): void {
  autopilotFreeLookYawRadians = 0
  autopilotFreeLookPitchRadians = 0
  refreshAutopilotFreeLookOffsetQuaternion()
}
let autopilotFreeLookDragPointerId = -1
let autopilotFreeLookLastClientX = 0
let autopilotFreeLookLastClientY = 0
// D91: wall-clock time of the last free-look interaction; after a quiet gap the camera eases back to
// center (the aim direction). Wall clock (not the sim clock) so it returns even while paused.
let autopilotFreeLookLastInteractionMs = 0
const AUTOPILOT_FREE_LOOK_RETURN_DELAY_SECONDS = 3 // idle gap before the smoothed return starts
const AUTOPILOT_FREE_LOOK_RETURN_RESPONSE_PER_SECOND = 3 // ease rate toward center (~0.6 s settle)
function noteAutopilotFreeLookInteraction(): void {
  autopilotFreeLookLastInteractionMs = performance.now()
}
gameRenderCanvas.addEventListener('pointerdown', (event) => {
  if (!autopilotModeActive) return // free-look drag only in AI mode (manual steering is the radar)
  autopilotFreeLookDragPointerId = event.pointerId
  autopilotFreeLookLastClientX = event.clientX
  autopilotFreeLookLastClientY = event.clientY
  noteAutopilotFreeLookInteraction()
})
gameRenderCanvas.addEventListener('pointermove', (event) => {
  if (autopilotFreeLookDragPointerId !== event.pointerId) return
  // D91 stuck-drag fix: if the primary button is no longer held (e.g. it was released OUTSIDE the
  // window and we never got a pointerup), end the drag instead of "sticking" in look mode on re-entry.
  if ((event.buttons & 1) === 0) {
    autopilotFreeLookDragPointerId = -1
    return
  }
  autopilotFreeLookYawRadians -= (event.clientX - autopilotFreeLookLastClientX) * AUTOPILOT_FREE_LOOK_RADIANS_PER_PIXEL
  autopilotFreeLookPitchRadians = Math.max(
    -AUTOPILOT_FREE_LOOK_MAX_PITCH_RADIANS,
    Math.min(
      AUTOPILOT_FREE_LOOK_MAX_PITCH_RADIANS,
      autopilotFreeLookPitchRadians - (event.clientY - autopilotFreeLookLastClientY) * AUTOPILOT_FREE_LOOK_RADIANS_PER_PIXEL,
    ),
  )
  autopilotFreeLookLastClientX = event.clientX
  autopilotFreeLookLastClientY = event.clientY
  noteAutopilotFreeLookInteraction()
  refreshAutopilotFreeLookOffsetQuaternion()
})
function endAutopilotFreeLookDrag(event: PointerEvent): void {
  if (autopilotFreeLookDragPointerId === event.pointerId) autopilotFreeLookDragPointerId = -1
}
gameRenderCanvas.addEventListener('pointerup', endAutopilotFreeLookDrag)
gameRenderCanvas.addEventListener('pointercancel', endAutopilotFreeLookDrag)
// D91: also catch the release when it happens OUTSIDE the canvas/window (the reported bug: drag out,
// release outside, return hovering with the button up). A window-level pointerup always ends the drag.
window.addEventListener('pointerup', endAutopilotFreeLookDrag)
window.addEventListener('blur', () => {
  autopilotFreeLookDragPointerId = -1
})

// D91: after AUTOPILOT_FREE_LOOK_RETURN_DELAY_SECONDS of no look interaction, smoothly ease the camera
// look-offset back to center (yaw/pitch → 0). Called every render frame.
function updateAutopilotFreeLookReturn(deltaSeconds: number): void {
  if (!autopilotModeActive) return
  if (autopilotFreeLookDragPointerId !== -1) return // actively dragging — don't fight the player
  if (autopilotFreeLookYawRadians === 0 && autopilotFreeLookPitchRadians === 0) return
  const idleSeconds = (performance.now() - autopilotFreeLookLastInteractionMs) / 1000
  if (idleSeconds < AUTOPILOT_FREE_LOOK_RETURN_DELAY_SECONDS) return
  const easeBlend = 1 - Math.exp(-AUTOPILOT_FREE_LOOK_RETURN_RESPONSE_PER_SECOND * deltaSeconds)
  autopilotFreeLookYawRadians += (0 - autopilotFreeLookYawRadians) * easeBlend
  autopilotFreeLookPitchRadians += (0 - autopilotFreeLookPitchRadians) * easeBlend
  if (Math.abs(autopilotFreeLookYawRadians) < 1e-4) autopilotFreeLookYawRadians = 0
  if (Math.abs(autopilotFreeLookPitchRadians) < 1e-4) autopilotFreeLookPitchRadians = 0
  refreshAutopilotFreeLookOffsetQuaternion()
}

// D79: bottom-of-view message shown while AI mode is active
const autopilotFreeLookMessage = document.createElement('div')
autopilotFreeLookMessage.className = 'autopilotFreeLookMessage'
autopilotFreeLookMessage.textContent = 'AI PILOT ACTIVE — DRAG VIEW SCREEN TO LOOK AROUND'
viewHudOverlay.appendChild(autopilotFreeLookMessage)
const autopilotToggleButton = document.createElement('button')
autopilotToggleButton.className = 'autopilotToggleButton'
autopilotToggleButton.textContent = 'AI'
function refreshAutopilotToggleButtonAppearance(): void {
  autopilotToggleButton.classList.toggle('autopilotToggleButtonActive', autopilotModeActive)
  autopilotToggleButton.setAttribute('aria-pressed', String(autopilotModeActive))
}
function setAutopilotModeActive(active: boolean): void {
  autopilotModeActive = active
  refreshAutopilotToggleButtonAppearance()
  // D91: in AI mode the round AI button is unavailable — you must use EXIT AI PILOT to leave. (Disabled
  // buttons don't fire clicks, so this also blocks re-toggling via the AI button.)
  autopilotToggleButton.disabled = active
  // D91: the THRUST button now lives in the radar square (outside the manual-controls block overlay),
  // so block manual thrust taps directly while in AI mode — but keep the button visible + glowing to
  // reflect the AI's thrust (reflectAutopilotThrustVisual). Pointer-events off = no manual input.
  flightControls.thrustButtonElement.style.pointerEvents = active ? 'none' : 'auto'
  autopilotSettingsPanel.setAiModeActive(active) // D75: show/hide the settings overlay with the mode
  manualControlsBlockOverlay.classList.toggle('manualControlsBlockOverlayActive', active) // D77
  resetAutopilotFreeLook() // D79: recenter the look-around when the mode toggles
  autopilotFreeLookMessage.classList.toggle('autopilotFreeLookMessageVisible', active) // D79
  if (!active) flightControls.reflectAutopilotThrustVisual(false) // D82: clear AI-driven button glow on exit
}
autopilotToggleButton.addEventListener('click', () => {
  if (autopilotIsForcedThisWave) return // can't drop out of AI during a forced-AI wave (D74 wave 3)
  setAutopilotModeActive(!autopilotModeActive)
})
setAutopilotModeActive(false)
// D91: AI button tucks into the radar square's bottom-LEFT dead corner (was the right side cluster)
radarRegion.appendChild(autopilotToggleButton)

// D76: wave-3 is a FORCED AI-ONLY level — red flash + a bold "manual controls malfunction" message,
// manual flight locked out (the toggle is blocked while forced). Unlocks again on the next wave.
const FORCED_AUTOPILOT_WAVE_NUMBER = 3
const autopilotMalfunctionFlash = document.createElement('div')
autopilotMalfunctionFlash.className = 'autopilotMalfunctionFlash'
document.body.appendChild(autopilotMalfunctionFlash)
const autopilotMalfunctionMessage = document.createElement('div')
autopilotMalfunctionMessage.className = 'autopilotMalfunctionMessage'
autopilotMalfunctionMessage.textContent =
  "WARNING - MALFUNCTION IN MANUAL FLIGHT CONTROLS DETECTED - MANUAL MODE OFFLINE - " +
  "'Sorry, captain, looks like you'll have to rely on the ships ai for this wave...'"
document.body.appendChild(autopilotMalfunctionMessage)
let autopilotMalfunctionMessageHideTimeoutHandle = 0
function showAutopilotMalfunctionWarning(): void {
  autopilotMalfunctionFlash.classList.remove('autopilotMalfunctionFlashActive')
  void autopilotMalfunctionFlash.offsetWidth // reflow so the flash animation restarts
  autopilotMalfunctionFlash.classList.add('autopilotMalfunctionFlashActive')
  autopilotMalfunctionMessage.classList.add('autopilotMalfunctionMessageVisible')
  window.clearTimeout(autopilotMalfunctionMessageHideTimeoutHandle)
  autopilotMalfunctionMessageHideTimeoutHandle = window.setTimeout(() => {
    autopilotMalfunctionMessage.classList.remove('autopilotMalfunctionMessageVisible')
  }, 5500)
}
// set/clear the forced-AI lock as each wave goes active
function applyForcedAutopilotForWave(waveNumber: number): void {
  if (waveNumber === FORCED_AUTOPILOT_WAVE_NUMBER) {
    autopilotIsForcedThisWave = true
    setAutopilotModeActive(true) // force AI on for the malfunction wave
    showAutopilotMalfunctionWarning()
  } else if (autopilotIsForcedThisWave) {
    autopilotIsForcedThisWave = false // manual flight restored next wave (AI stays on until toggled off)
  }
  // D87: EXIT AI PILOT is greyed out (non-interactive) while exiting is blocked on a forced-AI wave
  autopilotSettingsPanel.setExitAiPilotAvailable(!autopilotIsForcedThisWave)
}

// D74: autopilot evasion — tap-latch the nearest large asteroid to orbit (juke + isolate pursuers)
function latchNearestAsteroidForAutopilotEvasion(): void {
  if (!isShipMovingFastEnoughToGrapple()) return // D88: grapple disabled at low speed (same rule as the player)
  let nearestAsteroid: AsteroidBody | null = null
  let nearestDistanceMeters = Infinity
  for (const asteroid of gameWorld.asteroids) {
    if (asteroid.isDestroyed || asteroid.sizeClass !== 'large') continue
    const distanceMeters = playerShipState.positionMeters.distanceTo(asteroid.positionMeters)
    if (distanceMeters < nearestDistanceMeters) {
      nearestDistanceMeters = distanceMeters
      nearestAsteroid = asteroid
    }
  }
  if (!nearestAsteroid) return
  const nowSeconds = performance.now() / 1000
  grappleOrbitController.onAsteroidIconPressed(nearestAsteroid, playerShipState, nowSeconds)
  grappleOrbitController.onAsteroidIconReleased(nearestAsteroid, nowSeconds) // tap → commit the orbit
}

// now that the clusters + radar region exist, lay everything out and keep it in sync on resize
layoutGameRegions()
window.addEventListener('resize', layoutGameRegions)
const laserVolleySystem = createLaserVolleySystem(gameScene)
const missileVolleySystem = createMissileVolleySystem(gameScene)
const enemyConditionBarsDisplay = createEnemyConditionBarsDisplay(gameScene)
const enemyGrappleBeamsDisplay = createEnemyGrappleBeamsDisplay(gameScene) // D70 (visible enemy grapples)
const enemyTargetRings = createEnemyTargetRings(viewHudOverlay) // D49 (per-enemy red rotating rings)
const aimingReticle = createAimingReticle(viewHudOverlay) // D49 (fixed center aim reticle)
const shipWeaponCrosshair = createShipWeaponCrosshair(viewHudOverlay) // D52 (true weapon-bore marker)
const sunLensFlare = createSunLensFlare(viewHudOverlay) // D31
const powerUpSelectionOverlay = createPowerUpSelectionOverlay(controlsOverlay) // D33 (blocks full window)

// D23: procedural 8-bit techno music + SFX. Autoplay policy requires a user gesture before the
// AudioContext may produce sound, so we resume + start the loop on the first pointer/key event.
const gameAudioSystem = createGameAudioSystem()

// D90: SETTINGS menu (hamburger, top-right) replaces the old SOUND on/off toggle. Opening it pauses
// the game (isGamePausedBySettingsMenu freezes the sim) and exposes music + SFX volume sliders.
let isGamePausedBySettingsMenu = false
const gameSettingsMenu = createGameSettingsMenu(viewHudOverlay, gameAudioSystem, (isMenuOpen) => {
  isGamePausedBySettingsMenu = isMenuOpen
})
void gameSettingsMenu // referenced via its pause callback + closed automatically with the overlay

// D64: resume on EVERY gesture (not once) — iOS re-suspends the context, so a single resume left the
// game silent "fairly often". resumeAudioContextOnUserGesture is cheap + idempotent for music start.
function resumeGameAudioOnUserGesture(): void {
  gameAudioSystem.resumeAudioContextOnUserGesture()
}
window.addEventListener('pointerdown', resumeGameAudioOnUserGesture)
window.addEventListener('keydown', resumeGameAudioOnUserGesture)

// D54: simple start screen — shown at boot; the simulation is frozen until the player dismisses it.
// Dismissing also satisfies the audio autoplay gesture requirement.
const startScreenOverlay = document.createElement('div')
startScreenOverlay.className = 'startScreenOverlay'
startScreenOverlay.innerHTML = `
  <div class="startScreenInner">
    <h1 class="startScreenTitle">ASTEROID HUNTER</h1>
    <p class="startScreenTagline">In space there's no air to push against — <b>momentum is everything</b>.
      Thrust is weak: once you lose speed it takes a long time to build back up. The fast way to redirect
      your trajectory is to <b>grapple an asteroid and slingshot</b> off it.</p>
    <ul class="startScreenControls">
      <li>Hold <b>THRUST</b> to accelerate along your nose — aligned with travel speeds you up, against it slows you down</li>
      <li><b>Grapple asteroids</b> to swing your momentum around fast (and to dodge enemies)</li>
      <li>Keep your speed up — go too slow and the <b>tractor/grapple cut out</b> and you're an easy target</li>
      <li>Drag the <b>radar sphere</b> to aim; weapons fire <b>automatically</b> at a locked, visible enemy</li>
    </ul>
    <p class="startScreenPrompt">Tap or press Enter to begin</p>
  </div>`
document.body.appendChild(startScreenOverlay)

let gameHasStarted = false
function beginGameFromStartScreen(): void {
  if (gameHasStarted) return
  gameHasStarted = true
  startScreenOverlay.classList.add('startScreenOverlayHidden')
  resumeGameAudioOnUserGesture()
}
startScreenOverlay.addEventListener('pointerdown', (pointerEvent) => {
  pointerEvent.stopPropagation()
  beginGameFromStartScreen()
})
window.addEventListener('keydown', (keyboardEvent) => {
  if (keyboardEvent.code === 'Enter') beginGameFromStartScreen()
})

// camera view toggle button (D9) + KeyC shortcut
const cameraViewToggleButton = document.createElement('button')
cameraViewToggleButton.className = 'cameraViewToggleButton'
cameraViewToggleButton.textContent = 'VIEW: CHASE'
// D78: first-person (cockpit) view is PINNED for later — it isn't fully compatible with the newer
// features yet. The button + its toggle logic + the KeyC shortcut stay in code; we just don't mount
// the button in the UI. Re-add this appendChild to bring it back.
// viewHudOverlay.appendChild(cameraViewToggleButton)

function toggleCameraView(): void {
  const newViewMode = playerCameraRig.toggleCameraViewMode()
  cameraViewToggleButton.textContent = newViewMode === 'cockpit' ? 'VIEW: COCKPIT' : 'VIEW: CHASE'
  playerShipMesh.visible = newViewMode !== 'cockpit'
  cockpitFrameOverlay.setCockpitFrameVisible(newViewMode === 'cockpit') // D48
}
cameraViewToggleButton.addEventListener('click', toggleCameraView)
window.addEventListener('keydown', (keyboardEvent) => {
  if (keyboardEvent.code === 'KeyC') toggleCameraView()
})

// wave announcement banner (D2)
const waveAnnouncementBanner = document.createElement('div')
waveAnnouncementBanner.className = 'waveAnnouncementBanner'
viewHudOverlay.appendChild(waveAnnouncementBanner)

function showWaveBanner(bannerText: string): void {
  waveAnnouncementBanner.textContent = bannerText
  waveAnnouncementBanner.classList.add('waveAnnouncementBannerVisible')
}
function hideWaveBanner(): void {
  waveAnnouncementBanner.classList.remove('waveAnnouncementBannerVisible')
}

// ===== STEP 4: player-facing scratch + DEV verification hooks =====

const scratchPlayerForwardDirection = new THREE.Vector3()

// DEV-only verification hooks for automated browser testing (import.meta.env.DEV is false in production builds)
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).debugDamageNearestEnemy = (damageAmount = 25) => {
    let nearestEnemy: EnemyShip | null = null
    let nearestDistanceMeters = Infinity
    for (const enemyShip of gameWorld.enemyShips) {
      if (enemyShip.isDestroyed) continue
      const distanceMeters = playerShipState.positionMeters.distanceTo(enemyShip.positionMeters)
      if (distanceMeters < nearestDistanceMeters) {
        nearestDistanceMeters = distanceMeters
        nearestEnemy = enemyShip
      }
    }
    if (!nearestEnemy) return null
    weaponHitCallbacks.onEnemyHitByPlayer(nearestEnemy, damageAmount)
    return {
      enemyShipId: nearestEnemy.enemyShipId,
      distanceMeters: nearestDistanceMeters,
      shieldPointsRemaining: nearestEnemy.shieldPointsRemaining,
      hitPointsRemaining: nearestEnemy.hitPointsRemaining,
      activeBarCount: enemyConditionBarsDisplay.getActiveBarCount(),
    }
  }
  ;(window as unknown as Record<string, unknown>).debugPlaceNearestEnemyAheadOfPlayer = (distanceMeters = 60) => {
    let nearestEnemy: EnemyShip | null = null
    let nearestDistanceMeters = Infinity
    for (const enemyShip of gameWorld.enemyShips) {
      if (enemyShip.isDestroyed) continue
      const enemyDistanceMeters = playerShipState.positionMeters.distanceTo(enemyShip.positionMeters)
      if (enemyDistanceMeters < nearestDistanceMeters) {
        nearestDistanceMeters = enemyDistanceMeters
        nearestEnemy = enemyShip
      }
    }
    if (!nearestEnemy) return null
    getShipForwardDirection(playerShipState, scratchPlayerForwardDirection)
    nearestEnemy.positionMeters
      .copy(playerShipState.positionMeters)
      .addScaledVector(scratchPlayerForwardDirection, distanceMeters)
    nearestEnemy.velocityMetersPerSecond.set(0, 0, 0)
    return nearestEnemy.enemyShipId
  }
  // D54: read player kinematics for movement verification
  ;(window as unknown as Record<string, unknown>).debugReadShipKinematics = () => {
    getShipForwardDirection(playerShipState, scratchPlayerForwardDirection)
    return {
      position: playerShipState.positionMeters.toArray(),
      velocity: playerShipState.velocityMetersPerSecond.toArray(),
      speed: playerShipState.velocityMetersPerSecond.length(),
      forward: scratchPlayerForwardDirection.toArray(),
    }
  }
  // D57: measure the rigid-rig geometry (camera↔ship distance + ship's on-screen position)
  ;(window as unknown as Record<string, unknown>).debugReadCameraShipMetrics = () => {
    playerViewCamera.updateMatrixWorld()
    const shipScreenNdc = playerShipMesh.position.clone().project(playerViewCamera)
    return {
      cameraToShipDistanceMeters: playerViewCamera.position.distanceTo(playerShipMesh.position),
      shipScreenNdc: [shipScreenNdc.x, shipScreenNdc.y],
      cameraPosition: playerViewCamera.position.toArray(),
      shipMeshPosition: playerShipMesh.position.toArray(),
    }
  }
  // D57: rotate the commanded (camera) heading by a yaw angle, to test rotation deterministically
  ;(window as unknown as Record<string, unknown>).debugRotateCommandedYaw = (yawRadians = Math.PI / 2) => {
    const yawRotation = new THREE.Quaternion().setFromAxisAngle(SHIP_LOCAL_UP_AXIS, yawRadians)
    radarSphereDisplay.getCommandedOrientation().multiply(yawRotation).normalize()
    return true
  }
  // D60: latch (tap) the nearest asteroid to start an orbit, for slingshot verification
  ;(window as unknown as Record<string, unknown>).debugLatchNearestAsteroid = () => {
    let nearestAsteroid: AsteroidBody | null = null
    let nearestDistanceMeters = Infinity
    for (const asteroid of gameWorld.asteroids) {
      if (asteroid.isDestroyed || asteroid.sizeClass !== 'large') continue
      const distanceMeters = playerShipState.positionMeters.distanceTo(asteroid.positionMeters)
      if (distanceMeters < nearestDistanceMeters) {
        nearestDistanceMeters = distanceMeters
        nearestAsteroid = asteroid
      }
    }
    if (!nearestAsteroid) return null
    const nowSeconds = performance.now() / 1000
    grappleOrbitController.onAsteroidIconPressed(nearestAsteroid, playerShipState, nowSeconds)
    grappleOrbitController.onAsteroidIconReleased(nearestAsteroid, nowSeconds) // tap → commit the orbit
    return { asteroidId: nearestAsteroid.asteroidId, distanceMeters: nearestDistanceMeters }
  }
  // D33: force the between-wave power-up picker open (clears enemies, parks the machine)
  ;(window as unknown as Record<string, unknown>).debugForcePowerUpSelection = () => {
    removeAllEnemiesFromWorld()
    presentBetweenWavePowerUpChoice()
    currentWavePhase = 'powerUpSelection'
    return true
  }
}

// ===== STEP 5: wave system (D2, D8): staged waves, clear all enemies to advance =====

type WavePhase = 'waveIntro' | 'waveActive' | 'waveCleared' | 'powerUpSelection' | 'playerDestroyed'

let currentWaveNumber = 1
let currentWavePhase: WavePhase = 'waveIntro'
let wavePhaseCountdownSeconds = 2.5


const scratchEnemySpawnPosition = new THREE.Vector3()

function pickEnemySpawnPosition(outSpawnPosition: THREE.Vector3): THREE.Vector3 {
  // random point on a shell 450–650 m out, at least 250 m from the player
  for (let attempt = 0; attempt < 20; attempt++) {
    outSpawnPosition
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(450 + Math.random() * 200)
    if (outSpawnPosition.distanceTo(playerShipState.positionMeters) >= 250) return outSpawnPosition
  }
  return outSpawnPosition
}

type EnemyCombatTimers = {
  nextLaserFireTimeSeconds: number
  nextMissileFireTimeSeconds: number
  fireIntent: EnemyFireIntent
}
const enemyCombatTimersByShip = new WeakMap<EnemyShip, EnemyCombatTimers>()

function spawnEnemiesForWave(waveNumber: number): void {
  // D70: each archetype (behavior tier) carries its own grapple strength + look; waves escalate the MIX
  for (const behaviorTier of composeWaveEnemyBehaviorTiers(waveNumber)) {
    const spawnedEnemy = createEnemyShip(behaviorTier, pickEnemySpawnPosition(scratchEnemySpawnPosition), gameScene)
    enemyCombatTimersByShip.set(spawnedEnemy, {
      nextLaserFireTimeSeconds: 0,
      nextMissileFireTimeSeconds: 0,
      fireIntent: createEnemyFireIntent(),
    })
    gameWorld.enemyShips.push(spawnedEnemy)
  }
}

function removeAllEnemiesFromWorld(): void {
  for (const enemyShip of gameWorld.enemyShips) gameScene.remove(enemyShip.renderObject)
  gameWorld.enemyShips.length = 0
}

function resetPlayerShipForWaveRestart(): void {
  playerShipState.positionMeters.set(0, 0, 0)
  playerShipState.orientation.identity()
  // D88: spawn at FULL max speed moving forward (identity facing = -Z), so the player starts in motion
  // and isn't instantly in the low-speed warning state. Velocity then varies via thrust from here.
  playerShipState.velocityMetersPerSecond.set(0, 0, -playerShipBaseFlightStats.cruiseSpeedMetersPerSecond)
  playerShipState.currentPitchRateRadiansPerSecond = 0
  playerShipState.currentYawRateRadiansPerSecond = 0
  // snap the mesh AND the interpolation snapshot to the respawn pose so it doesn't interpolate across
  // the field from its old position (D21/D58)
  playerShipMesh.position.copy(playerShipState.positionMeters)
  playerShipMesh.quaternion.copy(playerShipState.orientation)
  playerShipPreviousSimPositionMeters.copy(playerShipState.positionMeters)
  playerShipPreviousSimOrientation.copy(playerShipState.orientation)
  playerShipCondition.restoreForWaveRestart()
}

// D33/D67: offer three random distinct power-ups; the picker waits for the player's tap
const BETWEEN_WAVE_POWER_UP_CHOICE_COUNT = 3 // D67: was 2
function presentBetweenWavePowerUpChoice(): void {
  hideWaveBanner()
  const offeredPowerUps = selectDistinctPowerUps(
    ALL_POWER_UP_DEFINITIONS,
    BETWEEN_WAVE_POWER_UP_CHOICE_COUNT,
    Math.random,
  )
  powerUpSelectionOverlay.showPowerUpChoices(offeredPowerUps, onBetweenWavePowerUpChosen)
}

// D33: apply the chosen upgrade to the live stats, then roll into the next wave's intro
function onBetweenWavePowerUpChosen(chosenPowerUp: PowerUpDefinition): void {
  chosenPowerUp.applyToPlayerStats()
  powerUpSelectionOverlay.hide()
  currentWaveNumber += 1
  showWaveBanner(`WAVE ${currentWaveNumber}`)
  currentWavePhase = 'waveIntro'
  wavePhaseCountdownSeconds = 2.5
}

function updateWavePhase(deltaSeconds: number): void {
  wavePhaseCountdownSeconds -= deltaSeconds

  if (currentWavePhase === 'waveIntro' && wavePhaseCountdownSeconds <= 0) {
    hideWaveBanner()
    spawnEnemiesForWave(currentWaveNumber)
    applyForcedAutopilotForWave(currentWaveNumber) // D76: wave 3 = forced AI-only
    currentWavePhase = 'waveActive'
    gameAudioSystem.playWaveStartSound() // D23
    return
  }

  if (currentWavePhase === 'waveActive') {
    if (playerShipCondition.isPlayerDestroyed()) {
      showWaveBanner('SHIP DESTROYED — RESTARTING WAVE')
      removeAllEnemiesFromWorld()
      currentWavePhase = 'playerDestroyed'
      wavePhaseCountdownSeconds = 3
      gameAudioSystem.playPlayerDestroyedSound() // D23
      return
    }
    const livingEnemyCount = gameWorld.enemyShips.filter((enemyShip) => !enemyShip.isDestroyed).length
    if (livingEnemyCount === 0) {
      showWaveBanner(`WAVE ${currentWaveNumber} CLEARED`)
      removeAllEnemiesFromWorld()
      currentWavePhase = 'waveCleared'
      wavePhaseCountdownSeconds = 3
      gameAudioSystem.playWaveClearedSound() // D23
    }
    return
  }

  if (currentWavePhase === 'waveCleared' && wavePhaseCountdownSeconds <= 0) {
    // D33: offer a power-up choice before the next wave; the machine waits in 'powerUpSelection'
    // (no countdown) until the player picks, which advances to the next wave intro.
    presentBetweenWavePowerUpChoice()
    currentWavePhase = 'powerUpSelection'
    return
  }
  // 'powerUpSelection' has no timed transition — onBetweenWavePowerUpChosen() drives it forward

  if (currentWavePhase === 'playerDestroyed' && wavePhaseCountdownSeconds <= 0) {
    resetPlayerShipForWaveRestart()
    showWaveBanner(`WAVE ${currentWaveNumber}`)
    currentWavePhase = 'waveIntro'
    wavePhaseCountdownSeconds = 2.5
  }
}

// ===== STEP 6: weapon hit routing (D11: both factions chip asteroids) =====

let simulationClockSeconds = 0

const weaponHitCallbacks = {
  onEnemyHitByPlayer(hitEnemy: EnemyShip, damageAmount: number): void {
    if (hitEnemy.isDestroyed) return
    applyWeaponDamageToEnemyShip(hitEnemy, damageAmount) // D21: shield absorbs before hull
    if (hitEnemy.isDestroyed) {
      gameScene.remove(hitEnemy.renderObject)
      gameAudioSystem.playExplosionSound() // D23
    } else {
      gameAudioSystem.playEnemyHitSound() // D23
    }
  },
  onAsteroidHit(hitAsteroid: AsteroidBody, impactPointMeters: THREE.Vector3, damageAmount: number): void {
    applyWeaponDamageToAsteroid(hitAsteroid, damageAmount, impactPointMeters, gameScene)
  },
  onPlayerHit(damageAmount: number): void {
    playerShipCondition.applyIncomingWeaponDamage(damageAmount, simulationClockSeconds)
    lastPlayerDamageAtSeconds = simulationClockSeconds // D74: autopilot's "flee after any damage" signal
    gameAudioSystem.playPlayerHitSound() // D23
  },
}

// ===== STEP 7: per-step combat: player auto-aim + fire, enemy AI + fire =====

let playerNextLaserFireTimeSeconds = 0
let playerNextMissileFireTimeSeconds = 0
let currentAutoAimTarget: EnemyShip | null = null

const scratchPlayerAimDirection = new THREE.Vector3()
const scratchProjectileOrigin = new THREE.Vector3()
const scratchEnemyProjectileOrigin = new THREE.Vector3()

function updatePlayerWeaponsFire(): void {
  getShipForwardDirection(playerShipState, scratchPlayerForwardDirection) // nose — for the firing origin + laser-alignment gate
  // D55: lock onto the enemy centered in the camera RETICLE (commanded forward), not the lagged nose,
  // so the lock matches what the player aimed the radar at. D51: occluded enemies are still skipped.
  scratchCommandedForward.copy(COMMANDED_FORWARD_LOCAL).applyQuaternion(radarSphereDisplay.getCommandedOrientation())
  currentAutoAimTarget = selectAutoAimTargetInNoseCone(
    playerShipState.positionMeters,
    scratchCommandedForward,
    gameWorld.enemyShips,
    gameWorld.asteroids,
    playerEngagementRange.combinedRadarWeaponRangeMeters, // D67: lock only within the combined range
  )

  // D47: weapons are ALWAYS ON — auto-fire at the locked (visible) target, gated only by cooldown.
  const lockedTarget = currentAutoAimTarget
  if (lockedTarget === null) return

  scratchProjectileOrigin
    .copy(playerShipState.positionMeters)
    .addScaledVector(scratchPlayerForwardDirection, 4)

  if (simulationClockSeconds >= playerNextLaserFireTimeSeconds) {
    // D6 + lead: shots aim at the predicted intercept for THIS weapon's projectile speed
    computeLeadAimDirection(
      scratchProjectileOrigin,
      lockedTarget.positionMeters,
      lockedTarget.velocityMetersPerSecond,
      playerBaseLaserStats.boltSpeedMetersPerSecond,
      scratchPlayerAimDirection,
    )
    // D52: lasers fly straight out of the nose, so they only fire once the hull has rotated close
    // enough to the firing solution (the ship aims ahead via D53). Missiles below bypass this — they home.
    if (isShipAlignedForLaserFire(scratchPlayerForwardDirection, scratchPlayerAimDirection)) {
      laserVolleySystem.tryFireLaserVolley(
        scratchProjectileOrigin,
        scratchPlayerAimDirection,
        playerBaseLaserStats,
        true,
        simulationClockSeconds,
      )
      playerNextLaserFireTimeSeconds = simulationClockSeconds + playerBaseLaserStats.fireCooldownSeconds
      gameAudioSystem.playLaserZapSound() // D23
    }
  }

  if (simulationClockSeconds >= playerNextMissileFireTimeSeconds) {
    // missiles lead with their own (slower) speed and weakly home toward the lock (R18 stats)
    computeLeadAimDirection(
      scratchProjectileOrigin,
      lockedTarget.positionMeters,
      lockedTarget.velocityMetersPerSecond,
      playerBaseMissileStats.missileSpeedMetersPerSecond,
      scratchPlayerAimDirection,
    )
    missileVolleySystem.tryFireMissile(
      scratchProjectileOrigin,
      scratchPlayerAimDirection,
      playerBaseMissileStats,
      true,
      simulationClockSeconds,
      lockedTarget,
    )
    playerNextMissileFireTimeSeconds = simulationClockSeconds + playerBaseMissileStats.fireCooldownSeconds
    gameAudioSystem.playMissileLaunchSound() // D23
  }
}

function updateEnemyShipsAndFire(deltaSeconds: number): void {
  // D67: the asteroid the player is currently orbiting — enemies that keep missing the orbiting player
  // will switch to destroying it (computed once per tick, shared by all enemies)
  const playerOrbitedAsteroid = grappleOrbitController.getLatchedAsteroid()
  for (const enemyShip of gameWorld.enemyShips) {
    if (enemyShip.isDestroyed) continue
    const combatTimers = enemyCombatTimersByShip.get(enemyShip)
    if (!combatTimers) continue

    updateEnemyShipBehavior(
      enemyShip,
      gameWorld.asteroids,
      playerShipState.positionMeters,
      deltaSeconds,
      combatTimers.fireIntent,
      playerOrbitedAsteroid,
    )

    scratchEnemyProjectileOrigin
      .copy(enemyShip.positionMeters)
      .addScaledVector(combatTimers.fireIntent.aimDirectionWorld, 5)

    if (
      combatTimers.fireIntent.wantsToFireLaser &&
      simulationClockSeconds >= combatTimers.nextLaserFireTimeSeconds
    ) {
      laserVolleySystem.tryFireLaserVolley(
        scratchEnemyProjectileOrigin,
        combatTimers.fireIntent.aimDirectionWorld,
        enemyBaseLaserStats,
        false,
        simulationClockSeconds,
      )
      combatTimers.nextLaserFireTimeSeconds = simulationClockSeconds + enemyBaseLaserStats.fireCooldownSeconds
    }

    if (
      combatTimers.fireIntent.wantsToFireMissile &&
      simulationClockSeconds >= combatTimers.nextMissileFireTimeSeconds
    ) {
      missileVolleySystem.tryFireMissile(
        scratchEnemyProjectileOrigin,
        combatTimers.fireIntent.aimDirectionWorld,
        enemyBaseMissileStats,
        false,
        simulationClockSeconds,
      )
      combatTimers.nextMissileFireTimeSeconds = simulationClockSeconds + enemyBaseMissileStats.fireCooldownSeconds
    }
  }
}

// ===== STEP 8: player movement (D54 momentum model) =====

const SHIP_LOCAL_UP_AXIS = new THREE.Vector3(0, 1, 0)

// D47/D53: keyboard pitch+yaw rotate the COMMANDED heading (camera frame) directly, at the ship's
// max turn rate, in the commanded frame's local axes (same convention as the radar drag). The
// camera = commanded; the SHIP does the aiming separately (see rotatePlayerShipTowardAimGoal).
const SHIP_LOCAL_RIGHT_AXIS = new THREE.Vector3(1, 0, 0)
const scratchCommandedYawRotation = new THREE.Quaternion()
const scratchCommandedPitchRotation = new THREE.Quaternion()
function applyPitchYawToCommandedHeading(
  commandedOrientation: THREE.Quaternion,
  pitchInput: number,
  yawInput: number,
  deltaSeconds: number,
): void {
  if (pitchInput === 0 && yawInput === 0) return
  const maxStepRadians = playerShipBaseFlightStats.maxTurnRateRadiansPerSecond * deltaSeconds
  scratchCommandedYawRotation.setFromAxisAngle(SHIP_LOCAL_UP_AXIS, -yawInput * maxStepRadians)
  scratchCommandedPitchRotation.setFromAxisAngle(SHIP_LOCAL_RIGHT_AXIS, pitchInput * maxStepRadians)
  commandedOrientation.multiply(scratchCommandedYawRotation).multiply(scratchCommandedPitchRotation).normalize()
}

// D80: the autopilot turns USING THE PLAYER'S HEADING CONTROL — it derives pitch/yaw inputs (exactly
// like the keyboard turn keys) toward its desired direction, which are then fed to the SAME
// applyPitchYawToCommandedHeading the player uses. The AI therefore can only turn the way a player can
// (bounded to maxTurnRate, two axes) — no bespoke/instant rotation, no ability the player lacks.
const scratchAutopilotInverseCommanded = new THREE.Quaternion()
const scratchAutopilotLocalDesiredDir = new THREE.Vector3()
const AUTOPILOT_TURN_INPUT_GAIN = 4 // proportional → full deflection until within ~15° of the target heading
let autopilotHeadingPitchInput = 0
let autopilotHeadingYawInput = 0
function computeAutopilotHeadingTurnInputs(
  commandedOrientation: THREE.Quaternion,
  desiredDirectionWorld: THREE.Vector3,
): void {
  if (desiredDirectionWorld.lengthSq() < 1e-9) {
    autopilotHeadingPitchInput = 0
    autopilotHeadingYawInput = 0
    return
  }
  // desired direction in the commanded (heading) local frame: forward=-Z, right=+X, up=+Y
  scratchAutopilotInverseCommanded.copy(commandedOrientation).invert()
  scratchAutopilotLocalDesiredDir.copy(desiredDirectionWorld).applyQuaternion(scratchAutopilotInverseCommanded).normalize()
  // sign matches applyPitchYawToCommandedHeading: +yawInput turns forward toward +X; +pitchInput toward +Y
  let yawInput = scratchAutopilotLocalDesiredDir.x * AUTOPILOT_TURN_INPUT_GAIN
  const pitchInput = scratchAutopilotLocalDesiredDir.y * AUTOPILOT_TURN_INPUT_GAIN
  // target BEHIND (local +Z) with little sideways offset → commit to a full turn-around rather than stall
  if (scratchAutopilotLocalDesiredDir.z > 0 && Math.abs(yawInput) < 1) {
    yawInput = scratchAutopilotLocalDesiredDir.x >= 0 ? 1 : -1
  }
  autopilotHeadingYawInput = Math.max(-1, Math.min(1, yawInput))
  autopilotHeadingPitchInput = Math.max(-1, Math.min(1, pitchInput))
}

// D43/D53: the ONE ship-rotation path. The ship's rotation GOAL is the camera (commanded/radar)
// heading — UNLESS an enemy is locked, in which case the goal becomes the lead-ahead aim point
// instead (NOT the camera), so the ship tracks the target even while you drag the camera elsewhere.
// Unlocked, the ship faces exactly where the camera looks (D55-fix).
const scratchShipAimLeadDirection = new THREE.Vector3()
const scratchShipAimCurrentForward = new THREE.Vector3()
const scratchShipAimDeltaRotation = new THREE.Quaternion()
const scratchShipRotationGoalOrientation = new THREE.Quaternion()
// D65: the ship's facing turn has angular momentum — this is the live turn rate that accelerates up
// to maxTurnRate and brakes back to 0 (a "turn power"), instead of snapping to a fixed rate.
let playerFacingTurnRateRadiansPerSecond = 0
function rotatePlayerShipTowardAimGoal(deltaSeconds: number): void {
  // D55-fix: the ship points exactly where the CAMERA looks (commanded heading) — UNLESS an enemy is
  // locked in the reticle, in which case the ship's facing slews to the fire-ahead (lead) position.
  const commandedOrientation = radarSphereDisplay.getCommandedOrientation()
  const lockedAimTarget = currentAutoAimTarget

  if (lockedAimTarget !== null && !lockedAimTarget.isDestroyed) {
    computeLeadAimDirection(
      playerShipState.positionMeters,
      lockedAimTarget.positionMeters,
      lockedAimTarget.velocityMetersPerSecond,
      playerBaseLaserStats.boltSpeedMetersPerSecond,
      scratchShipAimLeadDirection,
    )
    if (scratchShipAimLeadDirection.lengthSq() > 1e-12) {
      // GOAL = fire-ahead: build the orientation whose nose points along the lead direction, then
      // slew the ship toward it at the enemy-tracking rate (a smooth "alter to fire-ahead").
      getShipForwardDirection(playerShipState, scratchShipAimCurrentForward)
      scratchShipAimCurrentForward.normalize()
      scratchShipAimDeltaRotation.setFromUnitVectors(scratchShipAimCurrentForward, scratchShipAimLeadDirection)
      scratchShipRotationGoalOrientation.copy(scratchShipAimDeltaRotation).multiply(playerShipState.orientation).normalize()
      const stepRadians = playerShipBaseFlightStats.enemyTrackTurnRateRadiansPerSecond * deltaSeconds
      playerShipState.orientation.rotateTowards(scratchShipRotationGoalOrientation, stepRadians)
      playerShipState.currentPitchRateRadiansPerSecond = 0
      playerShipState.currentYawRateRadiansPerSecond = 0
      return
    }
  }

  // D65: no lock — turn the ship toward the camera heading with angular ACCELERATION (a "turn power").
  // The turn rate ramps up toward maxTurnRate and brakes back down so it arrives smoothly at the
  // heading (no hard snap to a fixed rate, and no overshoot).
  const angleToGoalRadians = playerShipState.orientation.angleTo(commandedOrientation)
  if (angleToGoalRadians > 1e-5) {
    const turnAcceleration = playerShipBaseFlightStats.turnAccelerationRadiansPerSecondSquared
    const maxTurnRate = playerShipBaseFlightStats.maxTurnRateRadiansPerSecond
    // fastest rate from which we can still decelerate to 0 exactly at the goal (v = sqrt(2·a·Δθ))
    const brakingLimitedTurnRate = Math.sqrt(2 * turnAcceleration * angleToGoalRadians)
    const targetTurnRate = Math.min(maxTurnRate, brakingLimitedTurnRate)
    const maxRateChangeThisFrame = turnAcceleration * deltaSeconds
    playerFacingTurnRateRadiansPerSecond += THREE.MathUtils.clamp(
      targetTurnRate - playerFacingTurnRateRadiansPerSecond,
      -maxRateChangeThisFrame,
      maxRateChangeThisFrame,
    )
    const stepRadians = Math.min(playerFacingTurnRateRadiansPerSecond * deltaSeconds, angleToGoalRadians)
    playerShipState.orientation.rotateTowards(commandedOrientation, stepRadians)
  } else {
    playerFacingTurnRateRadiansPerSecond = 0
  }
  playerShipState.currentPitchRateRadiansPerSecond = 0
  playerShipState.currentYawRateRadiansPerSecond = 0
}

const scratchShipWeaponBoreForward = new THREE.Vector3()
const scratchShipWeaponBoreWorldPoint = new THREE.Vector3()
// D79: aim-reticle anchoring — project the commanded-forward (auto-aim cone center) aim point to screen
const scratchCommandedForwardWorld = new THREE.Vector3()
const scratchAimReticleWorldPoint = new THREE.Vector3()
const scratchAimReticleNdc = new THREE.Vector3()

// D55: ease the commanded (camera) heading to keep a locked enemy centered in the reticle, at the
// enemy-tracking rate. Only runs when the player is NOT dragging the radar — a drag always wins
// (camera rotation IS the heading target then). Restores the camera-tracks-lock behavior.
const COMMANDED_FORWARD_LOCAL = new THREE.Vector3(0, 0, -1)
const scratchCommandedForward = new THREE.Vector3()
const scratchCommandedToEnemy = new THREE.Vector3()
const scratchCommandedTrackDelta = new THREE.Quaternion()
const scratchCommandedTrackTarget = new THREE.Quaternion()
function easeCommandedHeadingTowardEnemy(
  commandedOrientation: THREE.Quaternion,
  enemyPositionMeters: THREE.Vector3,
  deltaSeconds: number,
): void {
  scratchCommandedToEnemy.copy(enemyPositionMeters).sub(playerShipState.positionMeters)
  if (scratchCommandedToEnemy.lengthSq() < 1e-8) return
  scratchCommandedToEnemy.normalize()
  scratchCommandedForward.copy(COMMANDED_FORWARD_LOCAL).applyQuaternion(commandedOrientation)
  scratchCommandedTrackDelta.setFromUnitVectors(scratchCommandedForward, scratchCommandedToEnemy)
  scratchCommandedTrackTarget.copy(scratchCommandedTrackDelta).multiply(commandedOrientation).normalize()
  const maxStepRadians = playerShipBaseFlightStats.enemyTrackTurnRateRadiansPerSecond * deltaSeconds
  commandedOrientation.rotateTowards(scratchCommandedTrackTarget, maxStepRadians)
}

function updatePlayerMovement(deltaSeconds: number): void {
  const flightControlInput = flightControls.readFlightControlInput()

  // Camera/commanded heading: steered by radar drag (in the radar module) + keyboard here. When the
  // player is NOT dragging, the camera also eases to keep a LOCKED enemy centered (D55), at the
  // enemy-tracking rate. A drag always wins — then the camera rotation IS the heading target, and if
  // the drag carries the enemy out of the reticle there's no lock to track (hard rule). We never snap
  // the heading back to the ship (that caused a camera jump on drag release).
  const commandedOrientation = radarSphereDisplay.getCommandedOrientation()
  const radarIsSteeringDrag = radarSphereDisplay.isSteeringDrag()
  // D74: AUTOPILOT drives heading + thrust + evasion-orbit when AI mode is on; otherwise manual input.
  let effectiveThrustActive: boolean
  if (autopilotModeActive) {
    const autopilotContext: AutopilotContext = {
      playerPositionMeters: playerShipState.positionMeters,
      playerVelocityMetersPerSecond: playerShipState.velocityMetersPerSecond,
      enemyShips: gameWorld.enemyShips,
      asteroids: gameWorld.asteroids,
      shieldFraction: playerShipCondition.getShieldPointsFraction(),
      recentlyDamaged:
        simulationClockSeconds - lastPlayerDamageAtSeconds < AUTOPILOT_RECENT_DAMAGE_WINDOW_SECONDS,
      engagementRangeMeters: playerEngagementRange.combinedRadarWeaponRangeMeters,
      wasEvadingLastFrame: autopilotWasEvadingLastFrame,
      settings: shipAutopilotSettings,
    }
    computeAutopilotIntent(autopilotContext, autopilotIntent)
    autopilotWasEvadingLastFrame = autopilotIntent.isEvading
    // D80: turn via the PLAYER heading control (pitch/yaw → applyPitchYawToCommandedHeading), same as keys
    computeAutopilotHeadingTurnInputs(commandedOrientation, autopilotIntent.desiredHeadingDirectionWorld)
    applyPitchYawToCommandedHeading(
      commandedOrientation,
      autopilotHeadingPitchInput,
      autopilotHeadingYawInput,
      deltaSeconds,
    )
    if (autopilotIntent.latchCommand === 'latchNearestForEvasion') {
      if (!grappleOrbitController.isLatched()) latchNearestAsteroidForAutopilotEvasion()
    } else if (autopilotIntent.latchCommand === 'release' && grappleOrbitController.isLatched()) {
      grappleOrbitController.releaseLatch()
    }
    // D84: while orbiting, the AI doesn't press thrust (a player wouldn't either) — so the universal
    // "thrust disengages orbit" rule below doesn't fire and the orbit holds. Releasing is done via the
    // orbit-latch interface above, exactly like the player tapping the icon.
    effectiveThrustActive = grappleOrbitController.isLatched() ? false : autopilotIntent.thrustActive
  } else {
    if (!radarIsSteeringDrag) {
      applyPitchYawToCommandedHeading(
        commandedOrientation,
        flightControlInput.pitchInput,
        flightControlInput.yawInput,
        deltaSeconds,
      )
      const lockedEnemyForCameraTracking = currentAutoAimTarget
      if (lockedEnemyForCameraTracking !== null && !lockedEnemyForCameraTracking.isDestroyed) {
        easeCommandedHeadingTowardEnemy(commandedOrientation, lockedEnemyForCameraTracking.positionMeters, deltaSeconds)
      }
    }
    effectiveThrustActive = flightControls.isThrustActive()
  }

  // The ship's rotation goal is the camera heading, or the lead-aim point when an enemy is locked.
  rotatePlayerShipTowardAimGoal(deltaSeconds)

  // D62/D84: thrusting disengages the orbit — UNIVERSAL, driven by the effective thrust input (manual
  // button or autopilot), so the rule is identical whoever's flying. (The AI doesn't thrust while it
  // wants to orbit, so this only fires for the AI on an intentional break-off.)
  if (grappleOrbitController.isLatched() && effectiveThrustActive) {
    grappleOrbitController.releaseLatch()
  }

  if (grappleOrbitController.isLatched()) {
    // D60: latched — the ship is carried along the orbit (overrides thrust/momentum). On release the
    // controller leaves the tangential velocity behind, so momentum slingshots it off in a line.
    grappleOrbitController.stepOrbit(
      playerShipState,
      playerShipBaseFlightStats.cruiseSpeedMetersPerSecond,
      deltaSeconds,
    )
  } else {
    // D54: constant-momentum flight — rotation (facing) was already applied above; here we hold the
    // cruise speed and, while THRUST is held, curve the velocity vector toward the facing.
    stepShipFlightSimulation(
      playerShipState,
      { pitchInput: 0, yawInput: 0, thrustActive: effectiveThrustActive },
      playerShipBaseFlightStats,
      deltaSeconds,
    )
    // D62: at the field edge, gently steer the velocity into a far orbit (constant speed, no shove) —
    // but only when the player isn't actively dragging the radar to steer.
    // D84: UNIVERSAL — the edge corrective-orbit is a property of the ship/world, identical whether the
    // player or the AI is flying (zero-difference). The AI also actively steers back in (computeIdleIntent),
    // so it rarely reaches the boundary, but if it does it's treated exactly like a drifting player.
    easeShipIntoFieldEdgeOrbit(
      playerShipState.positionMeters,
      playerShipState.velocityMetersPerSecond,
      deltaSeconds,
      radarIsSteeringDrag,
    )
  }

  // D71: distance-based collision avoidance. Find the nearest close asteroid (excluding the one being
  // orbited), ramp by proximity. In FREE FLIGHT, steer the velocity outward (constant speed) — stronger
  // the closer it is. While ORBITING, the orbit controls motion, so we only record the state for the
  // deflection visuals. The render state below drives the white deflection ring + beam + player ring.
  // D84: UNIVERSAL collision-avoidance — identical whether player or AI is flying (zero-difference).
  const orbitedAsteroidForAvoidance = grappleOrbitController.getLatchedAsteroid()
  const nearestAvoidance = findNearestAvoidanceAsteroid(
    playerShipState.positionMeters,
    gameWorld.asteroids,
    orbitedAsteroidForAvoidance,
  )
  if (nearestAvoidance) {
    avoidanceTargetAsteroid = nearestAvoidance.asteroid
    avoidanceProximityFraction = computeAvoidanceProximityFraction(nearestAvoidance.surfaceDistanceMeters)
    if (!grappleOrbitController.isLatched() && avoidanceProximityFraction > 0) {
      applyAvoidancePushback(
        playerShipState.positionMeters,
        avoidanceTargetAsteroid.positionMeters,
        avoidanceProximityFraction,
        deltaSeconds,
      )
    }
  } else {
    avoidanceTargetAsteroid = null
    avoidanceProximityFraction = 0
  }

  // D82: the EFFECTIVE thrust this frame (manual button OR autopilot), used to drive the thruster visuals
  // (exhaust plume + the THRUST button lit). No plume while orbiting — the orbit carries the ship.
  currentEffectiveThrustActive = effectiveThrustActive && !grappleOrbitController.isLatched()
  if (autopilotModeActive) flightControls.reflectAutopilotThrustVisual(currentEffectiveThrustActive)
}

// ===== STEP 9: fixed-timestep simulation loop =====

const FIXED_SIMULATION_TIMESTEP_SECONDS = 1 / 60
let simulationTimeAccumulatorSeconds = 0
let previousFrameTimestampMs = performance.now()

// D58: fixed-timestep RENDER INTERPOLATION for the player ship. We snapshot the ship's pose before
// the last sim step and lerp/slerp the rendered mesh between that snapshot and the current sim pose
// by the leftover-accumulator fraction. This makes the ship move uniformly in real time regardless of
// how many fixed steps ran this frame (the old lag-lerp toward the latest pose stuttered randomly).
const playerShipPreviousSimPositionMeters = new THREE.Vector3()
const playerShipPreviousSimOrientation = new THREE.Quaternion()
let playerShipRenderInterpolationAlpha = 1

function updateGameSimulation(deltaSeconds: number): void {
  // D54: hold the whole simulation until the player dismisses the start screen
  if (!gameHasStarted) return
  // D90: the settings menu freezes the ENTIRE sim (including the wave-phase clock) while it's open
  if (isGamePausedBySettingsMenu) return
  simulationClockSeconds += deltaSeconds

  updateWavePhase(deltaSeconds)
  // D90: between-waves "level end" pause — the wave-phase clock above still advances (waveCleared →
  // power-up pick), but the ship/enemies/projectiles freeze so the game is paused at level end.
  if (currentWavePhase === 'waveCleared' || currentWavePhase === 'powerUpSelection') return
  updatePlayerMovement(deltaSeconds)

  if (currentWavePhase === 'waveActive') {
    updatePlayerWeaponsFire()
    updateEnemyShipsAndFire(deltaSeconds)
  } else {
    currentAutoAimTarget = null
  }

  laserVolleySystem.updateLaserBolts(
    deltaSeconds,
    gameWorld.asteroids,
    gameWorld.enemyShips,
    playerShipState.positionMeters,
    weaponHitCallbacks,
  )
  missileVolleySystem.updateMissiles(
    deltaSeconds,
    gameWorld.asteroids,
    gameWorld.enemyShips,
    playerShipState.positionMeters,
    weaponHitCallbacks,
  )

  updateDriftingAsteroids(gameWorld.asteroids, deltaSeconds)
  updateAsteroidDamageParticles(deltaSeconds)
  playerShipCondition.updateShieldRegeneration(deltaSeconds, simulationClockSeconds)
  radarSignatureTracker.updateRadarContacts(
    gameWorld.enemyShips,
    gameWorld.asteroids,
    playerShipState.positionMeters,
    simulationClockSeconds,
  )
}

// ===== STEP 10: per-frame render sync (HUD refresh, overlays, radar inset) =====

function syncRenderObjectsFromSimulation(): void {
  // D58: interpolate the rendered ship pose between the previous and current sim states (smooth,
  // uniform real-time motion — no lag, no random stutter). The camera follows this same mesh pose.
  playerShipMesh.position
    .copy(playerShipPreviousSimPositionMeters)
    .lerp(playerShipState.positionMeters, playerShipRenderInterpolationAlpha)
  playerShipMesh.quaternion
    .copy(playerShipPreviousSimOrientation)
    .slerp(playerShipState.orientation, playerShipRenderInterpolationAlpha)

  // D66: the always-on thin fuzzy ring tracks the ship (a sprite, so it auto-faces the camera)
  shipFuzzyRing.position.copy(playerShipMesh.position)

  // D54: thrust plume shows while THRUST is held (momentum steering), color cycling red→yellow
  updatePlayerEngineExhaust(currentEffectiveThrustActive ? 1 : 0, simulationClockSeconds) // D82: manual OR AI thrust

  // D21: blue shield / red hull bars over damaged enemies, billboarded to the player camera
  enemyConditionBarsDisplay.updateEnemyConditionBars(
    gameWorld.enemyShips,
    playerViewCamera,
    playerShipState.positionMeters,
    playerEngagementRange.combinedRadarWeaponRangeMeters,
  )
  // D70: visible enemy grapples (fuzzy ring on enemy + asteroid + connecting beam, while grappling)
  enemyGrappleBeamsDisplay.updateEnemyGrappleBeams(gameWorld.enemyShips)

  // D51: the center aim reticle turns red while actively locked onto a (visible) enemy
  aimingReticle.setEngaged(currentAutoAimTarget !== null)
  // D67: live preview of the locked enemy's model + its shield/hull under the THRUST button
  lockedEnemyPreview.updateLockedEnemyPreview(currentAutoAimTarget, simulationClockSeconds)
  playerConditionDisplay.updatePlayerConditionDisplay(
    playerShipCondition.getShieldPointsFraction(),
    playerShipCondition.getHullPointsFraction(),
  )
  radarSphereDisplay.updateRadarDisplay(
    radarSignatureTracker.getContactReadings(),
    playerShipState,
    radarSignatureTracker.getRecentActiveEnemyCount(),
    radarSignatureTracker.hasUnresolvedEnemies(),
    simulationClockSeconds,
  )
  // D60: rim icons for in-range slingshot-able asteroids (placed by bearing, colored by proximity)
  asteroidOrbitIcons.updateAsteroidOrbitIcons(
    gameWorld.asteroids,
    playerShipState,
    radarSphereDisplay.getCommandedOrientation(),
    grappleOrbitController.getLatchedAsteroidId(),
  )
  // D63/D64: thick tractor beam (cylinder) ship→asteroid + fuzzy ring around it; + radar marker
  const orbitedAsteroid = grappleOrbitController.getLatchedAsteroid()
  if (orbitedAsteroid) {
    scratchTractorBeamDelta.subVectors(orbitedAsteroid.positionMeters, playerShipMesh.position)
    const beamLengthMeters = scratchTractorBeamDelta.length()
    if (beamLengthMeters > 1e-3) {
      tractorBeamMesh.position.copy(playerShipMesh.position).addScaledVector(scratchTractorBeamDelta, 0.5)
      tractorBeamMesh.scale.set(TRACTOR_BEAM_RADIUS_METERS, beamLengthMeters, TRACTOR_BEAM_RADIUS_METERS)
      scratchTractorBeamDirection.copy(scratchTractorBeamDelta).divideScalar(beamLengthMeters)
      tractorBeamMesh.quaternion.setFromUnitVectors(CYLINDER_LOCAL_UP_AXIS, scratchTractorBeamDirection)
      tractorBeamMesh.visible = true
    }
    orbitTargetFuzzyRing.position.copy(orbitedAsteroid.positionMeters)
    // D77: bigger (×3.4) + a gentle pulse so the selected-asteroid highlight is clearly visible
    const selectedHighlightPulse = 1 + 0.08 * Math.sin(performance.now() * 0.004)
    const ringDiameterMeters = orbitedAsteroid.currentRadiusMeters * 3.4 * selectedHighlightPulse
    orbitTargetFuzzyRing.scale.set(ringDiameterMeters, ringDiameterMeters, 1)
    orbitTargetFuzzyRing.visible = true
    shipFuzzyRing.visible = true // D67: ship ring shows while the tractor beam is engaged (orbiting)
    shipFuzzyRing.material.opacity = 1
  } else {
    tractorBeamMesh.visible = false
    orbitTargetFuzzyRing.visible = false
    shipFuzzyRing.visible = false // D67: hidden when not orbiting (D71 may re-show it faded for avoidance below)
  }
  radarSphereDisplay.setOrbitTargetMarker(orbitedAsteroid ? orbitedAsteroid.positionMeters : null, playerShipState)

  // D71: collision-avoidance deflection visuals — white fuzzy ring on the approaching asteroid + a white
  // beam to the player ring, fading in by proximity. When NOT orbiting, also fade the player ring in.
  if (avoidanceTargetAsteroid && avoidanceProximityFraction > 0 && !avoidanceTargetAsteroid.isDestroyed) {
    const deflectionFade = avoidanceProximityFraction
    const deflectionRingDiameterMeters = avoidanceTargetAsteroid.currentRadiusMeters * 3
    avoidanceDeflectionRing.position.copy(avoidanceTargetAsteroid.positionMeters)
    avoidanceDeflectionRing.scale.set(deflectionRingDiameterMeters, deflectionRingDiameterMeters, 1)
    avoidanceDeflectionRing.material.opacity = deflectionFade
    avoidanceDeflectionRing.visible = true

    scratchAvoidanceBeamDelta.subVectors(avoidanceTargetAsteroid.positionMeters, playerShipMesh.position)
    const avoidanceBeamLengthMeters = scratchAvoidanceBeamDelta.length()
    if (avoidanceBeamLengthMeters > 1e-3) {
      avoidanceDeflectionBeam.position.copy(playerShipMesh.position).addScaledVector(scratchAvoidanceBeamDelta, 0.5)
      avoidanceDeflectionBeam.scale.set(
        AVOIDANCE_DEFLECTION_BEAM_RADIUS_METERS,
        avoidanceBeamLengthMeters,
        AVOIDANCE_DEFLECTION_BEAM_RADIUS_METERS,
      )
      scratchAvoidanceBeamDirection.copy(scratchAvoidanceBeamDelta).divideScalar(avoidanceBeamLengthMeters)
      avoidanceDeflectionBeam.quaternion.setFromUnitVectors(CYLINDER_LOCAL_UP_AXIS, scratchAvoidanceBeamDirection)
      ;(avoidanceDeflectionBeam.material as THREE.MeshBasicMaterial).opacity = 0.6 * deflectionFade
      avoidanceDeflectionBeam.visible = true
    }
    // show the player ring (faded) when avoidance is engaged in free flight (orbiting already shows it full)
    if (!shipFuzzyRing.visible) {
      shipFuzzyRing.visible = true
      shipFuzzyRing.material.opacity = deflectionFade
    }
  } else {
    avoidanceDeflectionRing.visible = false
    avoidanceDeflectionBeam.visible = false
  }

  // D88: bottom-left missile charge meter (1 = recharged/ready). The old speed-upgrade level bar was removed.
  const missileReadyFraction =
    1 - (playerNextMissileFireTimeSeconds - simulationClockSeconds) / playerBaseMissileStats.fireCooldownSeconds
  viewEdgeStatusIndicators.updateViewEdgeStatusIndicators(missileReadyFraction)

  // D86: bottom-right trajectory arrow (travel direction relative to the view) + speed bar (full at
  // cruise) + live m/s. Bar reads current speed over the present cruise max; m/s carries upgrade scaling.
  shipTrajectoryAndSpeedIndicator.updateShipTrajectoryAndSpeedIndicator(
    playerShipState.velocityMetersPerSecond,
    playerViewCamera.quaternion,
    playerShipBaseFlightStats.cruiseSpeedMetersPerSecond,
    LOW_SPEED_THRESHOLD_METERS_PER_SECOND,
  )
}

function runFrameLoop(currentFrameTimestampMs: number): void {
  requestAnimationFrame(runFrameLoop)

  const frameDeltaSeconds = Math.min((currentFrameTimestampMs - previousFrameTimestampMs) / 1000, 0.25)
  previousFrameTimestampMs = currentFrameTimestampMs

  simulationTimeAccumulatorSeconds += frameDeltaSeconds
  while (simulationTimeAccumulatorSeconds >= FIXED_SIMULATION_TIMESTEP_SECONDS) {
    // D58: snapshot the pose before the step so we can interpolate the render pose this frame
    playerShipPreviousSimPositionMeters.copy(playerShipState.positionMeters)
    playerShipPreviousSimOrientation.copy(playerShipState.orientation)
    updateGameSimulation(FIXED_SIMULATION_TIMESTEP_SECONDS)
    simulationTimeAccumulatorSeconds -= FIXED_SIMULATION_TIMESTEP_SECONDS
  }
  playerShipRenderInterpolationAlpha = simulationTimeAccumulatorSeconds / FIXED_SIMULATION_TIMESTEP_SECONDS

  // D91: ease the AI free-look camera back to center after the idle delay (real-time, view-only)
  updateAutopilotFreeLookReturn(frameDeltaSeconds)
  syncRenderObjectsFromSimulation()
  // D56-fix: pin the camera to the SMOOTHED mesh position (the one actually rendered), so the ship
  // never jitters or swims closer/farther relative to the rigid rig as it moves/rotates.
  playerCameraRig.updateCameraFollowingShip(
    playerShipMesh.position,
    radarSphereDisplay.getCommandedOrientation(),
    autopilotModeActive ? autopilotFreeLookOffsetQuaternion : undefined, // D79: AI free-look orbit
  )

  // screen-space HUD must run AFTER the camera moves this frame, with fresh matrices, so projection
  // to screen has no one-frame lag (D49 per-enemy rings, D31 sun lens flare)
  playerViewCamera.updateMatrixWorld()
  // D52: mark the ship's true weapon bore — a point straight ahead of the nose projected to the
  // view. It drifts off the center reticle as the ship aims ahead of the camera (D53).
  getShipForwardDirection(playerShipState, scratchShipWeaponBoreForward)
  scratchShipWeaponBoreWorldPoint
    .copy(playerShipState.positionMeters)
    .addScaledVector(scratchShipWeaponBoreForward, 300)
  shipWeaponCrosshair.updateShipWeaponCrosshair(
    scratchShipWeaponBoreWorldPoint,
    playerViewCamera,
    currentShipViewWidthPixels,
    currentShipViewHeightPixels,
  )
  // D79: anchor the aim reticle to the COMMANDED-FORWARD (auto-aim cone center) projected to screen, so
  // during AI free-look it stays on the real aim point (doesn't move with the camera). In normal flight
  // this projects to screen-center, exactly as before. Hidden if the aim point is behind the camera.
  scratchCommandedForwardWorld.copy(COMMANDED_FORWARD_LOCAL).applyQuaternion(radarSphereDisplay.getCommandedOrientation())
  scratchAimReticleWorldPoint.copy(playerShipState.positionMeters).addScaledVector(scratchCommandedForwardWorld, 300)
  scratchAimReticleNdc.copy(scratchAimReticleWorldPoint).project(playerViewCamera)
  if (scratchAimReticleNdc.z > 1 || Math.abs(scratchAimReticleNdc.x) > 1.3 || Math.abs(scratchAimReticleNdc.y) > 1.3) {
    aimingReticle.setAimScreenPosition(null)
  } else {
    aimingReticle.setAimScreenPosition(
      (scratchAimReticleNdc.x * 0.5 + 0.5) * currentShipViewWidthPixels,
      (-scratchAimReticleNdc.y * 0.5 + 0.5) * currentShipViewHeightPixels,
    )
  }
  // D67: every live enemy gets a ring; in-range = full rotating (locked spins faster + pulses),
  // out-of-range = tiny static red circle. Gated on the combined radar+weapon engagement range.
  enemyTargetRings.updateEnemyTargetRings(
    gameWorld.enemyShips,
    playerShipState.positionMeters,
    playerEngagementRange.combinedRadarWeaponRangeMeters,
    playerViewCamera,
    currentShipViewWidthPixels,
    currentShipViewHeightPixels,
    currentAutoAimTarget !== null ? currentAutoAimTarget.enemyShipId : null,
  )
  sunLensFlare.updateSunLensFlare(
    visibleSunDisk.position,
    playerViewCamera,
    currentShipViewWidthPixels,
    currentShipViewHeightPixels,
  )

  webglRenderer.render(gameScene, playerViewCamera)
  radarSphereDisplay.renderRadar() // D40: radar draws to its own canvas in the control cluster
}

showWaveBanner(`WAVE ${currentWaveNumber}`)
requestAnimationFrame(runFrameLoop)
