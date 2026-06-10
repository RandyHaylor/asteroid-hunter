import './style.css'
import * as THREE from 'three'
import { playerShipBaseFlightStats, playerShipBaseTractorBeamStats } from './shipStats'
import {
  createShipRigidBodyStateAtRest,
  getShipForwardDirection,
  stepShipFlightSimulation,
} from './gameSimulation/newtonianShipPhysics'
import type { AsteroidBody, EnemyShip, EnemyShipBehaviorTier, GameWorld } from './gameSimulation/gameWorldTypes'
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
import { createLaserVolleySystem } from './weapons/laserFire'
import { createMissileVolleySystem } from './weapons/missileFire'
import { createFireZoneButtons } from './hud/fireZoneButtons'
import {
  createEnemyFireIntent,
  createEnemyShip,
  updateEnemyShipBehavior,
  type EnemyFireIntent,
} from './enemies/enemyAlienShipBehavior'
import { createPlayerShipCondition } from './player/playerShipCondition'
import { createPlayerConditionDisplay } from './hud/playerConditionDisplay'
import { createRadarSignatureTracker } from './radar/radarSignatureTracker'
import { createRadarSphereDisplay } from './radar/radarSphereDisplay'
import { createTouchFlightControls } from './hud/touchFlightControls'
import { createPlayerCameraRig } from './hud/cameraChaseAndCockpit'
import { createPlayerShipMesh } from './player/playerShipMesh'

// ===== STEP 1: renderer, scene, camera bootstrap =====

const gameRenderCanvas = document.getElementById('gameRenderCanvas') as HTMLCanvasElement
const hudOverlayRoot = document.getElementById('hudOverlayRoot') as HTMLElement

const webglRenderer = new THREE.WebGLRenderer({ canvas: gameRenderCanvas, antialias: true })
webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
webglRenderer.setSize(window.innerWidth, window.innerHeight)

const gameScene = new THREE.Scene()
gameScene.background = new THREE.Color(0x05060f)

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
}

function releaseTractorPull(): void {
  tractorPullIsActive = false
  activeCoverAsteroid = null
  tractorBeamLine.visible = false
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
  ;(window as unknown as Record<string, unknown>).debugReadTractorState = () => ({
    tractorPullIsActive,
    distanceToCoverAsteroidCenter: activeCoverAsteroid
      ? playerShipState.positionMeters.distanceTo(activeCoverAsteroid.positionMeters)
      : null,
    holdShellRadius: activeCoverAsteroid ? computeCoverHoldShellRadiusMeters(activeCoverAsteroid) : null,
    distanceToCoverPoint:
      tractorPullIsActive && activeCoverAsteroid
        ? playerShipState.positionMeters.distanceTo(activeCoverPointMeters)
        : null,
  })
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
  playerShipCondition.restoreForWaveRestart()
  releaseTractorPull()
}

function updateWavePhase(deltaSeconds: number): void {
  wavePhaseCountdownSeconds -= deltaSeconds

  if (currentWavePhase === 'waveIntro' && wavePhaseCountdownSeconds <= 0) {
    hideWaveBanner()
    spawnEnemiesForWave(currentWaveNumber)
    currentWavePhase = 'waveActive'
    return
  }

  if (currentWavePhase === 'waveActive') {
    if (playerShipCondition.isPlayerDestroyed()) {
      showWaveBanner('SHIP DESTROYED — RESTARTING WAVE')
      removeAllEnemiesFromWorld()
      currentWavePhase = 'playerDestroyed'
      wavePhaseCountdownSeconds = 3
      return
    }
    const livingEnemyCount = gameWorld.enemyShips.filter((enemyShip) => !enemyShip.isDestroyed).length
    if (livingEnemyCount === 0) {
      showWaveBanner(`WAVE ${currentWaveNumber} CLEARED`)
      removeAllEnemiesFromWorld()
      currentWavePhase = 'waveCleared'
      wavePhaseCountdownSeconds = 3
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
    hitEnemy.hitPointsRemaining -= damageAmount
    if (hitEnemy.hitPointsRemaining <= 0) {
      hitEnemy.isDestroyed = true
      gameScene.remove(hitEnemy.renderObject)
    }
  },
  onAsteroidHit(hitAsteroid: AsteroidBody, impactPointMeters: THREE.Vector3, damageAmount: number): void {
    applyWeaponDamageToAsteroid(hitAsteroid, damageAmount, impactPointMeters, gameScene)
  },
  onPlayerHit(damageAmount: number): void {
    playerShipCondition.applyIncomingWeaponDamage(damageAmount, simulationClockSeconds)
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

  // D6: fire along the nose unless the auto-aim cone has a target
  if (currentAutoAimTarget) {
    scratchPlayerAimDirection
      .copy(currentAutoAimTarget.positionMeters)
      .sub(playerShipState.positionMeters)
      .normalize()
  } else {
    scratchPlayerAimDirection.copy(scratchPlayerForwardDirection)
  }

  const fireIntent = fireZoneButtons.readFireIntent()
  scratchProjectileOrigin
    .copy(playerShipState.positionMeters)
    .addScaledVector(scratchPlayerForwardDirection, 4)

  if (fireIntent.wantsLaserFire && simulationClockSeconds >= playerNextLaserFireTimeSeconds) {
    laserVolleySystem.tryFireLaserVolley(
      scratchProjectileOrigin,
      scratchPlayerAimDirection,
      playerBaseLaserStats,
      true,
      simulationClockSeconds,
    )
    playerNextLaserFireTimeSeconds = simulationClockSeconds + playerBaseLaserStats.fireCooldownSeconds
  }

  if (fireIntent.wantsMissileFire && simulationClockSeconds >= playerNextMissileFireTimeSeconds) {
    missileVolleySystem.tryFireMissile(
      scratchProjectileOrigin,
      scratchPlayerAimDirection,
      playerBaseMissileStats,
      true,
      simulationClockSeconds,
    )
    playerNextMissileFireTimeSeconds = simulationClockSeconds + playerBaseMissileStats.fireCooldownSeconds
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
const scratchFaceAsteroidMatrix = new THREE.Matrix4()
const scratchFaceAsteroidOrientation = new THREE.Quaternion()
const scratchShipUpDirection = new THREE.Vector3()

const SHIP_LOCAL_UP_AXIS = new THREE.Vector3(0, 1, 0)
const SHIP_LOCAL_RIGHT_AXIS = new THREE.Vector3(1, 0, 0)
/** how quickly the held ship turns to face its cover asteroid (1/seconds) */
const COVER_FACING_RESPONSE_PER_SECOND = 4

/** D14: joystick slides the hold point around the asteroid's shell instead of rotating the ship */
function adjustCoverHoldPointFromJoystick(
  coverAsteroid: AsteroidBody,
  pitchInput: number,
  yawInput: number,
  deltaSeconds: number,
): void {
  scratchCoverHoldDirection.copy(activeCoverPointMeters).sub(coverAsteroid.positionMeters).normalize()

  // ship faces the asteroid, so its local up/right axes are tangent to the shell — natural orbit axes
  scratchShipUpDirection.copy(SHIP_LOCAL_UP_AXIS).applyQuaternion(playerShipState.orientation)
  scratchOrbitRotation.setFromAxisAngle(
    scratchShipUpDirection,
    yawInput * COVER_ORBIT_RATE_RADIANS_PER_SECOND * deltaSeconds,
  )
  scratchCoverHoldDirection.applyQuaternion(scratchOrbitRotation)

  scratchOrbitRotationAxis.copy(SHIP_LOCAL_RIGHT_AXIS).applyQuaternion(playerShipState.orientation)
  scratchOrbitRotation.setFromAxisAngle(
    scratchOrbitRotationAxis,
    -pitchInput * COVER_ORBIT_RATE_RADIANS_PER_SECOND * deltaSeconds,
  )
  scratchCoverHoldDirection.applyQuaternion(scratchOrbitRotation)

  activeCoverPointMeters
    .copy(coverAsteroid.positionMeters)
    .addScaledVector(scratchCoverHoldDirection, computeCoverHoldShellRadiusMeters(coverAsteroid))
}

/** while tractored, the ship turns to face its cover asteroid — sliding the shell peeks you past the rim */
function slerpShipFacingTowardAsteroid(coverAsteroid: AsteroidBody, deltaSeconds: number): void {
  scratchShipUpDirection.copy(SHIP_LOCAL_UP_AXIS).applyQuaternion(playerShipState.orientation)
  scratchFaceAsteroidMatrix.lookAt(
    playerShipState.positionMeters,
    coverAsteroid.positionMeters,
    scratchShipUpDirection,
  )
  scratchFaceAsteroidOrientation.setFromRotationMatrix(scratchFaceAsteroidMatrix)
  const facingBlend = 1 - Math.exp(-COVER_FACING_RESPONSE_PER_SECOND * deltaSeconds)
  playerShipState.orientation.slerp(scratchFaceAsteroidOrientation, facingBlend)
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
      // D14: joystick slides the hold point around the shell; first manual nudge stops the auto re-solve
      const joystickEngaged =
        Math.abs(flightControlInput.pitchInput) > 0.1 || Math.abs(flightControlInput.yawInput) > 0.1
      if (joystickEngaged) {
        coverHoldManuallyAdjusted = true
        adjustCoverHoldPointFromJoystick(
          activeCoverAsteroid,
          flightControlInput.pitchInput,
          flightControlInput.yawInput,
          deltaSeconds,
        )
      }

      // re-solve the cover point a couple of times a second so it tracks moving enemies (R7),
      // unless the player has taken manual control of their position on the shell
      if (!coverHoldManuallyAdjusted) {
        coverPointResolveCountdownSeconds -= deltaSeconds
        if (coverPointResolveCountdownSeconds <= 0) {
          coverPointResolveCountdownSeconds = 0.5
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

      stepTractorBeamPull(
        playerShipState,
        activeCoverPointMeters,
        activeCoverAsteroid.positionMeters,
        playerShipBaseTractorBeamStats,
        deltaSeconds,
      )
      slerpShipFacingTowardAsteroid(activeCoverAsteroid, deltaSeconds)
      return
    }
  }

  stepShipFlightSimulation(playerShipState, flightControlInput, playerShipBaseFlightStats, deltaSeconds)
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

function syncRenderObjectsFromSimulation(frameDeltaSeconds: number): void {
  playerShipMesh.position.copy(playerShipState.positionMeters)
  playerShipMesh.quaternion.copy(playerShipState.orientation)

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
  webglRenderer.render(gameScene, playerViewCamera)
  radarSphereDisplay.renderRadarInset(webglRenderer)
}

showWaveBanner(`WAVE ${currentWaveNumber}`)
requestAnimationFrame(runFrameLoop)
