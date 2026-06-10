import * as THREE from 'three'

// R1: very basic visuals — the player ship is a low-poly dart built from primitives, nose pointing -Z.

// D19: a fixed diamond (octahedron) thrust plume out the back — size scales with thrust, and its
// only animation is the color fading red→yellow on a sine wave. Self-lit (MeshBasicMaterial, D13).
const EXHAUST_DIAMOND_RED = new THREE.Color(0xff2200)
const EXHAUST_DIAMOND_YELLOW = new THREE.Color(0xffcc00)
const EXHAUST_COLOR_SINE_RADIANS_PER_SECOND = 6
const EXHAUST_BASE_LENGTH_METERS = 2.4
const EXHAUST_BASE_WIDTH_METERS = 0.7
/** below this thrust fraction the plume is hidden entirely */
const EXHAUST_VISIBLE_THRUST_THRESHOLD = 0.02

let engineExhaustDiamondMesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial> | null = null

export function updatePlayerEngineExhaust(thrustFraction: number, nowSeconds: number): void {
  if (!engineExhaustDiamondMesh) return

  if (thrustFraction < EXHAUST_VISIBLE_THRUST_THRESHOLD) {
    engineExhaustDiamondMesh.visible = false
    return
  }
  engineExhaustDiamondMesh.visible = true

  // size relative to thrust (D19) — the diamond stretches backward from the engine
  const plumeLengthMeters = EXHAUST_BASE_LENGTH_METERS * thrustFraction
  const plumeWidthMeters = EXHAUST_BASE_WIDTH_METERS * (0.4 + 0.6 * thrustFraction)
  engineExhaustDiamondMesh.scale.set(plumeWidthMeters, plumeWidthMeters, plumeLengthMeters)
  engineExhaustDiamondMesh.position.z = 2.4 + plumeLengthMeters / 2

  // the only animation: red→yellow color fade on a sine wave
  const colorBlendFraction = (Math.sin(nowSeconds * EXHAUST_COLOR_SINE_RADIANS_PER_SECOND) + 1) / 2
  engineExhaustDiamondMesh.material.color.lerpColors(EXHAUST_DIAMOND_RED, EXHAUST_DIAMOND_YELLOW, colorBlendFraction)
}

export function createPlayerShipMesh(): THREE.Group {
  const playerShipGroup = new THREE.Group()

  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x4f7f99, flatShading: true })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50, flatShading: true })
  const engineGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0x113355,
    emissive: 0x33aaff,
    emissiveIntensity: 1.5,
  })

  const noseConeFuselage = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 6), hullMaterial)
  noseConeFuselage.rotation.x = -Math.PI / 2 // cone points -Z
  playerShipGroup.add(noseConeFuselage)

  const sweptWings = new THREE.Mesh(new THREE.BoxGeometry(5, 0.18, 1.6), accentMaterial)
  sweptWings.position.set(0, 0, 0.9)
  playerShipGroup.add(sweptWings)

  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 1.2), accentMaterial)
  tailFin.position.set(0, 0.7, 1.3)
  playerShipGroup.add(tailFin)

  const engineExhaustGlow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), engineGlowMaterial)
  engineExhaustGlow.position.set(0, 0, 2.1)
  engineExhaustGlow.scale.z = 0.6
  playerShipGroup.add(engineExhaustGlow)

  // D19: thrust plume diamond — unit octahedron, scaled/positioned every frame by updatePlayerEngineExhaust
  engineExhaustDiamondMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.5, 0),
    new THREE.MeshBasicMaterial({ color: EXHAUST_DIAMOND_RED }),
  )
  engineExhaustDiamondMesh.visible = false
  playerShipGroup.add(engineExhaustDiamondMesh)

  return playerShipGroup
}
