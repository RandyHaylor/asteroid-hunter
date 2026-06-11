import './style.css'
import * as THREE from 'three'
import { playerShipBaseFlightStats, playerShipBaseTractorBeamStats } from './shipStats'
import {
  createShipRigidBodyStateAtRest,
  getShipForwardDirection,
  stepShipFlightSimulation,
  stepShipRotationFromJoystick,
} from './gameSimulation/newtonianShipPhysics'
import {
  weaponEngagementRanges,
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
import { findTappedLargeAsteroid } from './tractorCover/asteroidTapTargeting'
import {
  computeCoverHoldShellRadiusMeters,
  solveCoverPositionBehindAsteroid,
} from './tractorCover/coverPositionSolver'
import { stepTractorBeamPull } from './tractorCover/tractorBeamPullForce'
import {
  createCoverGridOverlaysForLargeAsteroids,
  updateCoverGridOverlayColors,
} from './tractorCover/coverGridOverlayDisplay'
import {
  enemyBaseLaserStats,
  enemyBaseMissileStats,
  playerBaseLaserStats,
  playerBaseMissileStats,
} from './weapons/weaponStats'
import { selectAutoAimTargetInNoseCone, updateAutoAimTargetHighlight } from './weapons/noseConeAutoAim'
import { computeIdleAimAssistRotationInput } from './weapons/idleAimAssistTowardTarget'
import { createGameAudioSystem } from './audio/proceduralGameAudio'
import { createOffscreenEnemyIndicators } from './hud/offscreenEnemyIndicators'
import { createTargetingConeRing } from './weapons/targetingConeRing'
import { createSunLensFlare } from './hud/sunLensFlare'
import { createProceduralSpaceNebulaTexture } from './scene/proceduralSpaceSkybox'
import { computeLeadAimDirection } from './weapons/targetLeadPrediction'
import { createLaserVolleySystem } from './weapons/laserFire'
import { createMissileVolleySystem } from './weapons/missileFire'
import { createFireZoneButtons } from './hud/fireZoneButtons'
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
const hudOverlayRoot = document.getElementById('hudOverlayRoot') as HTMLElement

const webglRenderer = new THREE.WebGLRenderer({ canvas: gameRenderCanvas, antialias: true })
webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
webglRenderer.setSize(window.innerWidth, window.innerHeight)

const gameScene = new THREE.Scene()
// D30: an exaggerated colored nebula skybox (procedural, no asset files) replaces the near-black void
gameScene.background = createProceduralSpaceNebulaTexture()

const playerViewCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 8000)

window.addEventListener('resize', () => {
  playerViewCamera.aspect = window.innerWidth / window.innerHeight
  playerViewCamera.updateProjectionMatrix()
  webglRenderer.setSize(window.innerWidth, window.innerHeight)
})

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
createCoverGridOverlaysForLargeAsteroids(gameWorld.asteroids)

const playerShipState = createShipRigidBodyStateAtRest()
const playerShipMesh = createPlayerShipMesh()
gameScene.add(playerShipMesh)

const playerShipCondition = createPlayerShipCondition()
const flightControls = createTouchFlightControls(hudOverlayRoot)
const fireZoneButtons = createFireZoneButtons(hudOverlayRoot)
const playerCameraRig = createPlayerCameraRig(playerViewCamera)
const playerConditionDisplay = createPlayerConditionDisplay(hudOverlayRoot)
const radarSignatureTracker = createRadarSignatureTracker()
const radarSphereDisplay = createRadarSphereDisplay(hudOverlayRoot)
const laserVolleySystem = createLaserVolleySystem(gameScene)
const missileVolleySystem = createMissileVolleySystem(gameScene)
const enemyConditionBarsDisplay = createEnemyConditionBarsDisplay(gameScene)
const offscreenEnemyIndicators = createOffscreenEnemyIndicators(hudOverlayRoot) // D28
const targetingConeRing = createTargetingConeRing(gameScene) // D29
const sunLensFlare = createSunLensFlare(hudOverlayRoot) // D31

// D23: procedural 8-bit techno music + SFX. Autoplay policy requires a user gesture before the
// AudioContext may produce sound, so we resume + start the loop on the first pointer/key event.
const gameAudioSystem = createGameAudioSystem()

const soundToggleButton = document.createElement('button')
soundToggleButton.className = 'soundToggleButton'
soundToggleButton.textContent = 'SOUND: ON'
hudOverlayRoot.appendChild(soundToggleButton)

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

// camera view toggle button (D9) + KeyC shortcut
const cameraViewToggleButton = document.createElement('button')
cameraViewToggleButton.className = 'cameraViewToggleButton'
cameraViewToggleButton.textContent = 'VIEW: CHASE'
hudOverlayRoot.appendChild(cameraViewToggleButton)

function toggleCameraView(): void {
  const newViewMode = playerCameraRig.toggleCameraViewMode()
  cameraViewToggleButton.textContent = newViewMode === 'cockpit' ? 'VIEW: COCKPIT' : 'VIEW: CHASE'
  playerShipMesh.visible = newViewMode !== 'cockpit'
}
cameraViewToggleButton.addEventListener('click', toggleCameraView)
window.addEventListener('keydown', (keyboardEvent) => {
  if (keyboardEvent.code === 'KeyC') toggleCameraView()
})

// wave announcement banner (D2)
const waveAnnouncementBanner = document.createElement('div')
waveAnnouncementBanner.className = 'waveAnnouncementBanner'
hudOverlayRoot.appendChild(waveAnnouncementBanner)

function showWaveBanner(bannerText: string): void {
  waveAnnouncementBanner.textContent = bannerText
  waveAnnouncementBanner.classList.add('waveAnnouncementBannerVisible')
}
function hideWaveBanner(): void {
  waveAnnouncementBanner.classList.remove('waveAnnouncementBannerVisible')
}

// ===== STEP 4: tractor beam cover state (R4, R5, D14) =====

let tractorPullIsActive = false
let activeCoverAsteroid: AsteroidBody | null = null
const activeCoverPointMeters = new THREE.Vector3()
/** true once the player has slid around the shell with the joystick — stops the auto re-solve fighting them */
let coverHoldManuallyAdjusted = false
let coverPointResolveCountdownSeconds = 0

/** how fast the joystick slides the hold point around the asteroid shell (radians/second) */
const COVER_ORBIT_RATE_RADIANS_PER_SECOND = 0.9
/** moving the throttle past this releases the ship from cover (it was zeroed on tap) */
const COVER_ESCAPE_THROTTLE_THRESHOLD = 0.05

const tractorBeamLineGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
])
const tractorBeamLine = new THREE.Line(
  tractorBeamLineGeometry,
  new THREE.LineBasicMaterial({ color: 0x55ddff, transparent: true, opacity: 0.8 }),
)
tractorBeamLine.visible = false
gameScene.add(tractorBeamLine)

const scratchPlayerForwardDirection = new THREE.Vector3()

function engageTractorPullTowardAsteroid(tappedAsteroid: AsteroidBody): void {
  activeCoverAsteroid = tappedAsteroid
  getShipForwardDirection(playerShipState, scratchPlayerForwardDirection)
  solveCoverPositionBehindAsteroid(
    tappedAsteroid,
    gameWorld.enemyShips,
    playerShipState.positionMeters,
    scratchPlayerForwardDirection,
    activeCoverPointMeters,
  )
  tractorPullIsActive = true
  coverHoldManuallyAdjusted = false
  coverPointResolveCountdownSeconds = 0.5
  // D14: tapping an asteroid cuts the throttle to zero — pushing it back up is the escape
  flightControls.setThrottleFraction(0)
  // D18: cover mode pulls the camera back and reveals the strafe joystick
  flightControls.setStrafeJoystickVisible(true)
  playerCameraRig.setCoverZoomActive(true)
}

function releaseTractorPull(): void {
  tractorPullIsActive = false
  activeCoverAsteroid = null
  tractorBeamLine.visible = false
  flightControls.setStrafeJoystickVisible(false)
  playerCameraRig.setCoverZoomActive(false)
}

// tap on the world (not on a HUD control) targets a large asteroid for cover (R4, R6),
// but only within tractor grab range of the player (D16)
gameRenderCanvas.addEventListener('pointerdown', (pointerEvent) => {
  const normalizedDeviceX = (pointerEvent.clientX / window.innerWidth) * 2 - 1
  const normalizedDeviceY = -(pointerEvent.clientY / window.innerHeight) * 2 + 1
  const tappedAsteroid = findTappedLargeAsteroid(
    normalizedDeviceX,
    normalizedDeviceY,
    playerViewCamera,
    gameWorld.asteroids,
  )
  if (!tappedAsteroid) return
  const distanceToAsteroidSurfaceMeters =
    playerShipState.positionMeters.distanceTo(tappedAsteroid.positionMeters) -
    tappedAsteroid.currentRadiusMeters
  if (distanceToAsteroidSurfaceMeters > playerShipBaseTractorBeamStats.tractorGrabMaxRangeMeters) return
  engageTractorPullTowardAsteroid(tappedAsteroid) // re-tap re-targets (R5)
})

// DEV-only verification hooks for automated browser testing (import.meta.env.DEV is false in production builds)
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).debugEngageNearestGrabbableAsteroid = () => {
    let nearestLargeAsteroid: AsteroidBody | null = null
    let nearestSurfaceDistanceMeters = Infinity
    for (const asteroid of gameWorld.asteroids) {
      if (asteroid.isDestroyed || asteroid.sizeClass !== 'large') continue
      const surfaceDistanceMeters =
        playerShipState.positionMeters.distanceTo(asteroid.positionMeters) - asteroid.currentRadiusMeters
      if (surfaceDistanceMeters < nearestSurfaceDistanceMeters) {
        nearestSurfaceDistanceMeters = surfaceDistanceMeters
        nearestLargeAsteroid = asteroid
      }
    }
    if (!nearestLargeAsteroid) return null
    if (nearestSurfaceDistanceMeters > playerShipBaseTractorBeamStats.tractorGrabMaxRangeMeters) {
      return { outOfRange: true, surfaceDistanceMeters: nearestSurfaceDistanceMeters }
    }
    engageTractorPullTowardAsteroid(nearestLargeAsteroid)
    return { asteroidId: nearestLargeAsteroid.asteroidId, surfaceDistanceMeters: nearestSurfaceDistanceMeters }
  }
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
  ;(window as unknown as Record<string, unknown>).debugReadTractorState = () => {
    let coverLatitudeDegrees: number | null = null
    if (tractorPullIsActive && activeCoverAsteroid) {
      const holdDirection = activeCoverPointMeters.clone().sub(activeCoverAsteroid.positionMeters).normalize()
      const shipUpDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(playerShipState.orientation)
      coverLatitudeDegrees = 90 - THREE.MathUtils.radToDeg(holdDirection.angleTo(shipUpDirection))
    }
    return {
      tractorPullIsActive,
      distanceToCoverAsteroidCenter: activeCoverAsteroid
        ? playerShipState.positionMeters.distanceTo(activeCoverAsteroid.positionMeters)
        : null,
      holdShellRadius: activeCoverAsteroid ? computeCoverHoldShellRadiusMeters(activeCoverAsteroid) : null,
      distanceToCoverPoint:
        tractorPullIsActive && activeCoverAsteroid
          ? playerShipState.positionMeters.distanceTo(activeCoverPointMeters)
          : null,
      coverLatitudeDegrees,
    }
  }
}

// ===== STEP 5: wave system (D2, D8): staged waves, clear all enemies to advance =====

type WavePhase = 'waveIntro' | 'waveActive' | 'waveCleared' | 'playerDestroyed'

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
  releaseTractorPull()
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
    currentWaveNumber += 1
    showWaveBanner(`WAVE ${currentWaveNumber}`)
    currentWavePhase = 'waveIntro'
    wavePhaseCountdownSeconds = 2.5
    return
  }

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
  getShipForwardDirection(playerShipState, scratchPlayerForwardDirection)
  currentAutoAimTarget = selectAutoAimTargetInNoseCone(
    playerShipState.positionMeters,
    scratchPlayerForwardDirection,
    gameWorld.enemyShips,
  )

  const fireIntent = fireZoneButtons.readFireIntent()
  scratchProjectileOrigin
    .copy(playerShipState.positionMeters)
    .addScaledVector(scratchPlayerForwardDirection, 4)

  if (fireIntent.wantsLaserFire && simulationClockSeconds >= playerNextLaserFireTimeSeconds) {
    // D6 + lead: locked shots aim at the predicted intercept for THIS weapon's projectile speed,
    // so upgrades that change bolt speed automatically change the lead
    if (currentAutoAimTarget) {
      computeLeadAimDirection(
        scratchProjectileOrigin,
        currentAutoAimTarget.positionMeters,
        currentAutoAimTarget.velocityMetersPerSecond,
        playerBaseLaserStats.boltSpeedMetersPerSecond,
        scratchPlayerAimDirection,
      )
    } else {
      scratchPlayerAimDirection.copy(scratchPlayerForwardDirection)
    }
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

  if (fireIntent.wantsMissileFire && simulationClockSeconds >= playerNextMissileFireTimeSeconds) {
    // missiles lead with their own (slower) speed and weakly home toward the lock (R18 stats)
    if (currentAutoAimTarget) {
      computeLeadAimDirection(
        scratchProjectileOrigin,
        currentAutoAimTarget.positionMeters,
        currentAutoAimTarget.velocityMetersPerSecond,
        playerBaseMissileStats.missileSpeedMetersPerSecond,
        scratchPlayerAimDirection,
      )
    } else {
      scratchPlayerAimDirection.copy(scratchPlayerForwardDirection)
    }
    missileVolleySystem.tryFireMissile(
      scratchProjectileOrigin,
      scratchPlayerAimDirection,
      playerBaseMissileStats,
      true,
      simulationClockSeconds,
      currentAutoAimTarget,
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

// ===== STEP 8: player movement — tractor pull overrides flight (both integrate, never run together) =====

const scratchCoverHoldDirection = new THREE.Vector3()
const scratchOrbitRotationAxis = new THREE.Vector3()
const scratchOrbitRotation = new THREE.Quaternion()
const scratchShipUpDirection = new THREE.Vector3()

const SHIP_LOCAL_UP_AXIS = new THREE.Vector3(0, 1, 0)

/** keep this margin short of the poles so the latitude frame never degenerates or flips (D20) */
const COVER_POLE_CLAMP_MARGIN_RADIANS = 0.1

// D20: latitude/longitude strafing — the pole axis is the ship's CURRENT up, so the grid is always
// oriented to the player. Up/down climbs latitude lines (toward/away from the up-pole), left/right
// travels around the current latitude line. No compounding cross-axis rotations = no gimbal drift.
function adjustCoverHoldPointFromStrafeInput(
  coverAsteroid: AsteroidBody,
  strafeXInput: number,
  strafeYInput: number,
  deltaSeconds: number,
): void {
  scratchCoverHoldDirection.copy(activeCoverPointMeters).sub(coverAsteroid.positionMeters).normalize()
  scratchShipUpDirection.copy(SHIP_LOCAL_UP_AXIS).applyQuaternion(playerShipState.orientation)

  // STEP 1: left/right — travel around the current latitude line (rotate around the pole axis)
  if (strafeXInput !== 0) {
    scratchOrbitRotation.setFromAxisAngle(
      scratchShipUpDirection,
      strafeXInput * COVER_ORBIT_RATE_RADIANS_PER_SECOND * deltaSeconds,
    )
    scratchCoverHoldDirection.applyQuaternion(scratchOrbitRotation)
  }

  // STEP 2: up/down — change latitude within the meridian plane, clamped short of the poles
  if (strafeYInput !== 0) {
    scratchOrbitRotationAxis.crossVectors(scratchCoverHoldDirection, scratchShipUpDirection)
    if (scratchOrbitRotationAxis.lengthSq() > 1e-8) {
      scratchOrbitRotationAxis.normalize()

      const angleToUpPoleRadians = scratchCoverHoldDirection.angleTo(scratchShipUpDirection)
      let latitudeStepRadians = strafeYInput * COVER_ORBIT_RATE_RADIANS_PER_SECOND * deltaSeconds
      if (latitudeStepRadians > 0) {
        // climbing toward the up-pole: stop just before it
        latitudeStepRadians = Math.min(
          latitudeStepRadians,
          Math.max(0, angleToUpPoleRadians - COVER_POLE_CLAMP_MARGIN_RADIANS),
        )
      } else {
        // descending toward the down-pole: stop just before it
        latitudeStepRadians = Math.max(
          latitudeStepRadians,
          -Math.max(0, Math.PI - angleToUpPoleRadians - COVER_POLE_CLAMP_MARGIN_RADIANS),
        )
      }

      scratchOrbitRotation.setFromAxisAngle(scratchOrbitRotationAxis, latitudeStepRadians)
      scratchCoverHoldDirection.applyQuaternion(scratchOrbitRotation)
    }
  }

  activeCoverPointMeters
    .copy(coverAsteroid.positionMeters)
    .addScaledVector(scratchCoverHoldDirection, computeCoverHoldShellRadiusMeters(coverAsteroid))
}

// D22: below this rotation-input magnitude the player counts as "not actively steering",
// so the weak idle aim-assist may take over and nudge the nose toward the locked target.
const ACTIVE_STEERING_INPUT_DEADBAND = 0.05

/**
 * The pitch/yaw inputs to actually rotate with: the player's own input whenever they are steering,
 * otherwise the weak aim-assist toward the locked target (D22). Falls back to the raw player input
 * when there is no live target, so behaviour is unchanged when nothing is locked.
 */
function resolveEffectiveRotationInput(
  playerPitchInput: number,
  playerYawInput: number,
): { pitchInput: number; yawInput: number } {
  const playerIsActivelySteering =
    Math.abs(playerPitchInput) > ACTIVE_STEERING_INPUT_DEADBAND ||
    Math.abs(playerYawInput) > ACTIVE_STEERING_INPUT_DEADBAND
  if (playerIsActivelySteering || currentAutoAimTarget === null || currentAutoAimTarget.isDestroyed) {
    return { pitchInput: playerPitchInput, yawInput: playerYawInput }
  }
  return computeIdleAimAssistRotationInput(
    playerShipState.orientation,
    playerShipState.positionMeters,
    currentAutoAimTarget.positionMeters,
    playerShipBaseFlightStats,
  )
}

function updatePlayerMovement(deltaSeconds: number): void {
  const flightControlInput = flightControls.readFlightControlInput()

  if (tractorPullIsActive && activeCoverAsteroid) {
    // D14 escape routes: move the throttle (it was zeroed on tap) or tap another asteroid
    if (activeCoverAsteroid.isDestroyed) {
      releaseTractorPull()
    } else if (flightControlInput.throttleFraction > COVER_ESCAPE_THROTTLE_THRESHOLD) {
      releaseTractorPull()
    } else {
      // D18: the rotation joystick keeps aiming the ship even while held on the shell —
      // orientation only changes when the player commands it (no auto-facing).
      // D22: when the player isn't steering, the weak aim-assist nudges the nose toward the lock.
      const coverRotationInput = resolveEffectiveRotationInput(
        flightControlInput.pitchInput,
        flightControlInput.yawInput,
      )
      stepShipRotationFromJoystick(
        playerShipState,
        coverRotationInput.pitchInput,
        coverRotationInput.yawInput,
        playerShipBaseFlightStats,
        deltaSeconds,
      )

      // D18: the strafe joystick slides the hold point; first manual nudge stops the auto re-solve
      const strafeControlInput = flightControls.readStrafeControlInput()
      const strafeEngaged =
        Math.abs(strafeControlInput.strafeXInput) > 0.1 || Math.abs(strafeControlInput.strafeYInput) > 0.1
      if (strafeEngaged) {
        coverHoldManuallyAdjusted = true
        adjustCoverHoldPointFromStrafeInput(
          activeCoverAsteroid,
          strafeControlInput.strafeXInput,
          strafeControlInput.strafeYInput,
          deltaSeconds,
        )
      }

      // re-solve the cover point a couple of times a second so it tracks moving enemies (R7),
      // unless the player has taken manual control of their position on the shell.
      // D18: only when enemies actually threaten the asteroid — otherwise the facing-based default
      // would drag the parked ship around whenever the player rotates to look elsewhere
      if (!coverHoldManuallyAdjusted) {
        coverPointResolveCountdownSeconds -= deltaSeconds
        if (coverPointResolveCountdownSeconds <= 0) {
          coverPointResolveCountdownSeconds = 0.5
          const coverAsteroidPosition = activeCoverAsteroid.positionMeters
          const enemiesThreatenCoverAsteroid = gameWorld.enemyShips.some(
            (enemyShip) =>
              !enemyShip.isDestroyed &&
              enemyShip.positionMeters.distanceTo(coverAsteroidPosition) <=
                weaponEngagementRanges.missileEffectiveLongRangeMeters,
          )
          if (enemiesThreatenCoverAsteroid) {
            getShipForwardDirection(playerShipState, scratchPlayerForwardDirection)
            solveCoverPositionBehindAsteroid(
              activeCoverAsteroid,
              gameWorld.enemyShips,
              playerShipState.positionMeters,
              scratchPlayerForwardDirection,
              activeCoverPointMeters,
            )
          }
        }
      }

      stepTractorBeamPull(
        playerShipState,
        activeCoverPointMeters,
        activeCoverAsteroid.positionMeters,
        playerShipBaseTractorBeamStats,
        deltaSeconds,
      )
      return
    }
  }

  // D22: apply the weak idle aim-assist to free-flight rotation too (throttle/thrust unchanged)
  const flightRotationInput = resolveEffectiveRotationInput(
    flightControlInput.pitchInput,
    flightControlInput.yawInput,
  )
  stepShipFlightSimulation(
    playerShipState,
    {
      pitchInput: flightRotationInput.pitchInput,
      yawInput: flightRotationInput.yawInput,
      throttleFraction: flightControlInput.throttleFraction,
    },
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

let coverGridRecolorCountdownSeconds = 0

/** D21: light visual smoothing buffer — filters single-frame placement thrash without visible lag */
const PLAYER_MESH_SMOOTHING_STIFFNESS_PER_SECOND = 25

function syncRenderObjectsFromSimulation(frameDeltaSeconds: number): void {
  const meshSmoothingBlend = 1 - Math.exp(-PLAYER_MESH_SMOOTHING_STIFFNESS_PER_SECOND * frameDeltaSeconds)
  playerShipMesh.position.lerp(playerShipState.positionMeters, meshSmoothingBlend)
  playerShipMesh.quaternion.slerp(playerShipState.orientation, meshSmoothingBlend)

  // D19: thrust plume diamond — sized by throttle, color cycling red→yellow
  updatePlayerEngineExhaust(flightControls.readFlightControlInput().throttleFraction, simulationClockSeconds)

  // D21: blue shield / red hull bars over damaged enemies, billboarded to the player camera
  enemyConditionBarsDisplay.updateEnemyConditionBars(gameWorld.enemyShips, playerViewCamera)

  if (tractorPullIsActive && activeCoverAsteroid) {
    tractorBeamLine.visible = true
    const beamEndpoints = tractorBeamLineGeometry.attributes.position as THREE.BufferAttribute
    beamEndpoints.setXYZ(
      0,
      playerShipState.positionMeters.x,
      playerShipState.positionMeters.y,
      playerShipState.positionMeters.z,
    )
    beamEndpoints.setXYZ(
      1,
      activeCoverAsteroid.positionMeters.x,
      activeCoverAsteroid.positionMeters.y,
      activeCoverAsteroid.positionMeters.z,
    )
    beamEndpoints.needsUpdate = true
  } else {
    tractorBeamLine.visible = false
  }

  // recolor cover grids a few times per second, not every frame (R8)
  coverGridRecolorCountdownSeconds -= frameDeltaSeconds
  if (coverGridRecolorCountdownSeconds <= 0) {
    coverGridRecolorCountdownSeconds = 0.25
    getShipForwardDirection(playerShipState, scratchPlayerForwardDirection)
    updateCoverGridOverlayColors(
      gameWorld.asteroids,
      gameWorld.enemyShips,
      playerShipState.positionMeters,
      scratchPlayerForwardDirection,
      gameWorld.asteroids,
      playerShipBaseTractorBeamStats.tractorGrabMaxRangeMeters,
    )
  }

  updateAutoAimTargetHighlight(currentAutoAimTarget, gameScene, playerViewCamera)

  // D29: green targeting ring sized to the aim cone at the closest live enemy's depth
  getShipForwardDirection(playerShipState, scratchPlayerForwardDirection)
  let nearestLiveEnemy: EnemyShip | null = null
  let nearestEnemyDistanceSquared = Infinity
  for (const enemyShip of gameWorld.enemyShips) {
    if (enemyShip.isDestroyed) continue
    const distanceSquared = enemyShip.positionMeters.distanceToSquared(playerShipState.positionMeters)
    if (distanceSquared < nearestEnemyDistanceSquared) {
      nearestEnemyDistanceSquared = distanceSquared
      nearestLiveEnemy = enemyShip
    }
  }
  targetingConeRing.updateTargetingConeRing(
    nearestLiveEnemy,
    playerShipState.positionMeters,
    scratchPlayerForwardDirection,
  )
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
  playerCameraRig.updateCameraFollowingShip(playerShipState, frameDeltaSeconds)

  // screen-space HUD must run AFTER the camera moves this frame, with fresh matrices, so projection
  // to screen has no one-frame lag (D28 off-screen enemy markers, D31 sun lens flare)
  playerViewCamera.updateMatrixWorld()
  offscreenEnemyIndicators.updateOffscreenEnemyIndicators(
    radarSignatureTracker.getContactReadings(),
    playerViewCamera,
    playerShipState.positionMeters,
  )
  sunLensFlare.updateSunLensFlare(visibleSunDisk.position, playerViewCamera)

  webglRenderer.render(gameScene, playerViewCamera)
  radarSphereDisplay.renderRadarInset(webglRenderer)
}

showWaveBanner(`WAVE ${currentWaveNumber}`)
requestAnimationFrame(runFrameLoop)
