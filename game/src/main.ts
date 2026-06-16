import './style.css'
import * as THREE from 'three'
import { playerShipBaseFlightStats } from './shipStats'
import {
  createShipRigidBodyStateAtRest,
  getShipForwardDirection,
  stepShipFlightSimulation,
} from './gameSimulation/newtonianShipPhysics'
import {
  type AsteroidBody,
  type EnemyShip,
  type EnemyShipBehaviorTier,
  type GameWorld,
} from './gameSimulation/gameWorldTypes'
import { applySoftBoundaryPushback } from './gameSimulation/boundedPlayAreaSoftEdge'
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
  selectTwoDistinctPowerUps,
  type PowerUpDefinition,
} from './upgrades/powerUpDefinitions'
import { computeLeadAimDirection } from './weapons/targetLeadPrediction'
import { createLaserVolleySystem } from './weapons/laserFire'
import { createMissileVolleySystem } from './weapons/missileFire'
import { createWeaponCooldownIndicators } from './hud/weaponCooldownIndicators'
import { createCockpitFrameOverlay } from './hud/cockpitFrameOverlay'
import {
  createEnemyFireIntent,
  createEnemyShip,
  updateEnemyShipBehavior,
  type EnemyFireIntent,
} from './enemies/enemyAlienShipBehavior'
import { applyWeaponDamageToEnemyShip } from './enemies/enemyShipDamage'
import { createEnemyConditionBarsDisplay } from './enemies/enemyConditionBarsDisplay'
import { createPlayerShipCondition } from './player/playerShipCondition'
import { createPlayerConditionDisplay } from './hud/playerConditionDisplay'
import { createRadarSignatureTracker } from './radar/radarSignatureTracker'
import { createRadarSphereDisplay } from './radar/radarSphereDisplay'
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
const LANDSCAPE_LEFT_STRIP_MIN_PIXELS = 140
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
    const leftStripWidthPixels = viewportWidthPixels - shipViewWidthPixels - radarSidePixels
    const blockTopPixels = Math.floor((viewportHeightPixels - blockHeightPixels) / 2)
    for (const viewElement of [gameRenderCanvas, viewHudOverlay]) {
      applyFixedBoxStyle(viewElement, leftStripWidthPixels, blockTopPixels, shipViewWidthPixels, shipViewHeightPixels)
    }
    applyFixedBoxStyle(radarRegion, leftStripWidthPixels + shipViewWidthPixels, blockTopPixels, radarSidePixels, radarSidePixels)
    const stripSplitPixels = Math.floor(viewportHeightPixels * 0.6)
    applyFixedBoxStyle(leftControlCluster, 0, 0, leftStripWidthPixels, stripSplitPixels)
    applyFixedBoxStyle(rightControlCluster, 0, stripSplitPixels, leftStripWidthPixels, viewportHeightPixels - stripSplitPixels)
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
const playerShipMesh = createPlayerShipMesh()
gameScene.add(playerShipMesh)

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
// D47: weapons are always on (no fire buttons) — tiny on-view cooldown indicators replace them
const weaponCooldownIndicators = createWeaponCooldownIndicators(viewHudOverlay)
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

// now that the clusters + radar region exist, lay everything out and keep it in sync on resize
layoutGameRegions()
window.addEventListener('resize', layoutGameRegions)
const laserVolleySystem = createLaserVolleySystem(gameScene)
const missileVolleySystem = createMissileVolleySystem(gameScene)
const enemyConditionBarsDisplay = createEnemyConditionBarsDisplay(gameScene)
const enemyTargetRings = createEnemyTargetRings(viewHudOverlay) // D49 (per-enemy red rotating rings)
const aimingReticle = createAimingReticle(viewHudOverlay) // D49 (fixed center aim reticle)
const shipWeaponCrosshair = createShipWeaponCrosshair(viewHudOverlay) // D52 (true weapon-bore marker)
const sunLensFlare = createSunLensFlare(viewHudOverlay) // D31
const powerUpSelectionOverlay = createPowerUpSelectionOverlay(controlsOverlay) // D33 (blocks full window)

// D23: procedural 8-bit techno music + SFX. Autoplay policy requires a user gesture before the
// AudioContext may produce sound, so we resume + start the loop on the first pointer/key event.
const gameAudioSystem = createGameAudioSystem()

const soundToggleButton = document.createElement('button')
soundToggleButton.className = 'soundToggleButton'
soundToggleButton.textContent = 'SOUND: ON'
viewHudOverlay.appendChild(soundToggleButton)

function toggleGameSound(): void {
  const nowMuted = gameAudioSystem.toggleMuted()
  soundToggleButton.textContent = nowMuted ? 'SOUND: OFF' : 'SOUND: ON'
}
soundToggleButton.addEventListener('click', (clickEvent) => {
  clickEvent.stopPropagation()
  toggleGameSound()
})
window.addEventListener('keydown', (keyboardEvent) => {
  if (keyboardEvent.code === 'KeyM') toggleGameSound()
})

let gameAudioResumedAfterGesture = false
function resumeGameAudioOnFirstGesture(): void {
  if (gameAudioResumedAfterGesture) return
  gameAudioResumedAfterGesture = true
  gameAudioSystem.resumeAfterFirstUserGesture()
}
window.addEventListener('pointerdown', resumeGameAudioOnFirstGesture)
window.addEventListener('keydown', resumeGameAudioOnFirstGesture)

// D54: simple start screen — shown at boot; the simulation is frozen until the player dismisses it.
// Dismissing also satisfies the audio autoplay gesture requirement.
const startScreenOverlay = document.createElement('div')
startScreenOverlay.className = 'startScreenOverlay'
startScreenOverlay.innerHTML = `
  <div class="startScreenInner">
    <h1 class="startScreenTitle">ASTEROID HUNTER</h1>
    <p class="startScreenTagline">In space, turning is expensive — there's no air to push against.
      Slingshot around asteroids to change direction, and hunt the swarm.</p>
    <ul class="startScreenControls">
      <li>Hold <b>THRUST</b> to curve your momentum toward where you're facing</li>
      <li>Drag the <b>radar sphere</b> to aim</li>
      <li>Weapons fire <b>automatically</b> at a locked, visible enemy</li>
    </ul>
    <p class="startScreenPrompt">Tap or press Enter to begin</p>
  </div>`
document.body.appendChild(startScreenOverlay)

let gameHasStarted = false
function beginGameFromStartScreen(): void {
  if (gameHasStarted) return
  gameHasStarted = true
  startScreenOverlay.classList.add('startScreenOverlayHidden')
  resumeGameAudioOnFirstGesture()
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
viewHudOverlay.appendChild(cameraViewToggleButton)

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

function composeWaveEnemyBehaviorTiers(waveNumber: number): EnemyShipBehaviorTier[] {
  // D8: early waves are only dumb patrol; orbit-strafers then cover-hunters mix in as waves progress
  const behaviorTiers: EnemyShipBehaviorTier[] = []
  const dumbPatrolCount = waveNumber <= 2 ? 2 + waveNumber : 2
  const orbitStrafeCount = waveNumber >= 3 ? Math.min(5, waveNumber - 1) : 0
  const coverHunterCount = waveNumber >= 5 ? Math.min(5, waveNumber - 4) : 0
  for (let count = 0; count < dumbPatrolCount; count++) behaviorTiers.push('dumbPatrol')
  for (let count = 0; count < orbitStrafeCount; count++) behaviorTiers.push('orbitStrafe')
  for (let count = 0; count < coverHunterCount; count++) behaviorTiers.push('coverHunter')
  return behaviorTiers
}

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
  playerShipState.velocityMetersPerSecond.set(0, 0, 0)
  playerShipState.orientation.identity()
  playerShipState.currentPitchRateRadiansPerSecond = 0
  playerShipState.currentYawRateRadiansPerSecond = 0
  // snap the smoothed mesh to the respawn pose so it doesn't visibly fly across the field (D21)
  playerShipMesh.position.copy(playerShipState.positionMeters)
  playerShipMesh.quaternion.copy(playerShipState.orientation)
  playerShipCondition.restoreForWaveRestart()
}

// D33: offer two random distinct power-ups; the picker waits for the player's tap
function presentBetweenWavePowerUpChoice(): void {
  hideWaveBanner()
  const offeredPowerUps = selectTwoDistinctPowerUps(ALL_POWER_UP_DEFINITIONS, Math.random)
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

// D43/D53: the ONE ship-rotation path. The ship's rotation GOAL is the camera (commanded/radar)
// heading — UNLESS an enemy is locked, in which case the goal becomes the lead-ahead aim point
// instead (NOT the camera), so the ship tracks the target even while you drag the camera elsewhere.
// There is no "idle" state. Locked: minimal-arc toward the lead direction (no roll change) at the
// steady enemyTrackTurnRate. Unlocked: eased catch-up toward the camera heading (D43), rate-capped.
const SHIP_FOLLOW_SMOOTHING_PER_SECOND = 6
const scratchShipAimLeadDirection = new THREE.Vector3()
const scratchShipAimCurrentForward = new THREE.Vector3()
const scratchShipAimDeltaRotation = new THREE.Quaternion()
const scratchShipRotationGoalOrientation = new THREE.Quaternion()
function rotatePlayerShipTowardAimGoal(deltaSeconds: number): void {
  const lockedAimTarget = currentAutoAimTarget
  let isTrackingLockedTarget = false
  if (lockedAimTarget !== null && !lockedAimTarget.isDestroyed) {
    computeLeadAimDirection(
      playerShipState.positionMeters,
      lockedAimTarget.positionMeters,
      lockedAimTarget.velocityMetersPerSecond,
      playerBaseLaserStats.boltSpeedMetersPerSecond,
      scratchShipAimLeadDirection,
    )
    if (scratchShipAimLeadDirection.lengthSq() > 1e-12) {
      // GOAL = aim ahead of the locked enemy (minimal-arc rotation from the nose to the lead dir)
      getShipForwardDirection(playerShipState, scratchShipAimCurrentForward)
      scratchShipAimCurrentForward.normalize()
      scratchShipAimDeltaRotation.setFromUnitVectors(scratchShipAimCurrentForward, scratchShipAimLeadDirection)
      scratchShipRotationGoalOrientation.copy(scratchShipAimDeltaRotation).multiply(playerShipState.orientation).normalize()
      isTrackingLockedTarget = true
    }
  }
  if (!isTrackingLockedTarget) {
    // GOAL = the camera (commanded/radar) heading
    scratchShipRotationGoalOrientation.copy(radarSphereDisplay.getCommandedOrientation())
  }

  const angleToGoalRadians = playerShipState.orientation.angleTo(scratchShipRotationGoalOrientation)
  if (angleToGoalRadians > 1e-4) {
    const maxTurnStepRadians = playerShipBaseFlightStats.maxTurnRateRadiansPerSecond * deltaSeconds
    const stepRadians = isTrackingLockedTarget
      ? playerShipBaseFlightStats.enemyTrackTurnRateRadiansPerSecond * deltaSeconds
      : Math.min(angleToGoalRadians * (1 - Math.exp(-SHIP_FOLLOW_SMOOTHING_PER_SECOND * deltaSeconds)), maxTurnStepRadians)
    playerShipState.orientation.rotateTowards(scratchShipRotationGoalOrientation, stepRadians)
  }
  playerShipState.currentPitchRateRadiansPerSecond = 0
  playerShipState.currentYawRateRadiansPerSecond = 0
}

const scratchShipWeaponBoreForward = new THREE.Vector3()
const scratchShipWeaponBoreWorldPoint = new THREE.Vector3()

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

  // The ship's rotation goal is the camera heading, or the lead-aim point when an enemy is locked.
  rotatePlayerShipTowardAimGoal(deltaSeconds)

  // D54: constant-momentum flight — rotation (facing) was already applied above; here we hold the
  // cruise speed and, while THRUST is held, curve the velocity vector toward the facing.
  stepShipFlightSimulation(
    playerShipState,
    { pitchInput: 0, yawInput: 0, thrustActive: flightControls.isThrustActive() },
    playerShipBaseFlightStats,
    deltaSeconds,
  )
  applySoftBoundaryPushback(playerShipState.positionMeters, playerShipState.velocityMetersPerSecond, deltaSeconds)
}

// ===== STEP 9: fixed-timestep simulation loop =====

const FIXED_SIMULATION_TIMESTEP_SECONDS = 1 / 60
let simulationTimeAccumulatorSeconds = 0
let previousFrameTimestampMs = performance.now()

function updateGameSimulation(deltaSeconds: number): void {
  // D54: hold the whole simulation until the player dismisses the start screen
  if (!gameHasStarted) return
  simulationClockSeconds += deltaSeconds

  updateWavePhase(deltaSeconds)
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

/** D21: light visual smoothing buffer — filters single-frame placement thrash without visible lag */
const PLAYER_MESH_SMOOTHING_STIFFNESS_PER_SECOND = 25

function syncRenderObjectsFromSimulation(frameDeltaSeconds: number): void {
  const meshSmoothingBlend = 1 - Math.exp(-PLAYER_MESH_SMOOTHING_STIFFNESS_PER_SECOND * frameDeltaSeconds)
  playerShipMesh.position.lerp(playerShipState.positionMeters, meshSmoothingBlend)
  playerShipMesh.quaternion.slerp(playerShipState.orientation, meshSmoothingBlend)

  // D54: thrust plume shows while THRUST is held (momentum steering), color cycling red→yellow
  updatePlayerEngineExhaust(flightControls.isThrustActive() ? 1 : 0, simulationClockSeconds)

  // D21: blue shield / red hull bars over damaged enemies, billboarded to the player camera
  enemyConditionBarsDisplay.updateEnemyConditionBars(gameWorld.enemyShips, playerViewCamera)

  // D51: the center aim reticle turns red while actively locked onto a (visible) enemy
  aimingReticle.setEngaged(currentAutoAimTarget !== null)
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

  // D47: tiny on-view weapon cooldown indicators (1 = recharged/ready)
  const laserReadyFraction =
    1 - (playerNextLaserFireTimeSeconds - simulationClockSeconds) / playerBaseLaserStats.fireCooldownSeconds
  const missileReadyFraction =
    1 - (playerNextMissileFireTimeSeconds - simulationClockSeconds) / playerBaseMissileStats.fireCooldownSeconds
  weaponCooldownIndicators.updateWeaponCooldownIndicators(laserReadyFraction, missileReadyFraction)
}

function runFrameLoop(currentFrameTimestampMs: number): void {
  requestAnimationFrame(runFrameLoop)

  const frameDeltaSeconds = Math.min((currentFrameTimestampMs - previousFrameTimestampMs) / 1000, 0.25)
  previousFrameTimestampMs = currentFrameTimestampMs

  simulationTimeAccumulatorSeconds += frameDeltaSeconds
  while (simulationTimeAccumulatorSeconds >= FIXED_SIMULATION_TIMESTEP_SECONDS) {
    updateGameSimulation(FIXED_SIMULATION_TIMESTEP_SECONDS)
    simulationTimeAccumulatorSeconds -= FIXED_SIMULATION_TIMESTEP_SECONDS
  }

  syncRenderObjectsFromSimulation(frameDeltaSeconds)
  // D43: the camera aligns to the COMMANDED (radar) orientation and snaps instantly when the radar
  // is rotated; the ship lags behind it (catches up). When idle, commanded == ship.
  playerCameraRig.updateCameraFollowingShip(
    playerShipState,
    radarSphereDisplay.getCommandedOrientation(),
    frameDeltaSeconds,
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
  // D50: driven by radar readings so the visible(red)/last-seen(yellow) mechanic is preserved
  enemyTargetRings.updateEnemyTargetRings(
    radarSignatureTracker.getContactReadings(),
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
