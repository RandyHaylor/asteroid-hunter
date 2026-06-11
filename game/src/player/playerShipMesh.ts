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

// D25: a flat horizontal delta wing per side, lying in the y=0 plane. Each wing is one triangle:
// a swept leading edge from the inner-front of the fuselage out to the wide trailing edge at the
// back, so the planform flares outward as it goes aft. Non-indexed → crisp flat-shaded facets.
function buildSweptDeltaWingGeometry(): THREE.BufferGeometry {
  const innerFrontZ = -2.7 // leading-edge root well forward toward the nose → sharper rearward sweep
  const trailingEdgeZ = 2.8 // at the tail
  const rootHalfWidth = 0.45 // sits just outside the fuselage
  const tipHalfWidth = 3.6 // broad trailing-edge span

  // right wing (positive x) and left wing (mirrored), each a single triangle (3 verts)
  const wingVertexPositions = new Float32Array([
    // right wing
    rootHalfWidth, 0, innerFrontZ,
    tipHalfWidth, 0, trailingEdgeZ,
    rootHalfWidth, 0, trailingEdgeZ,
    // left wing (x mirrored)
    -rootHalfWidth, 0, innerFrontZ,
    -rootHalfWidth, 0, trailingEdgeZ,
    -tipHalfWidth, 0, trailingEdgeZ,
  ])

  const wingGeometry = new THREE.BufferGeometry()
  wingGeometry.setAttribute('position', new THREE.BufferAttribute(wingVertexPositions, 3))
  wingGeometry.computeVertexNormals()
  return wingGeometry
}

export function createPlayerShipMesh(): THREE.Group {
  const playerShipGroup = new THREE.Group()

  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x4f7f99, flatShading: true })
  // DoubleSide: the delta wings are flat (zero-thickness) planes, lit from above or below
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c3e50,
    flatShading: true,
    side: THREE.DoubleSide,
  })
  const engineGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0x113355,
    emissive: 0x33aaff,
    emissiveIntensity: 1.5,
  })

  // D25: a longer, slimmer nose cone so the ship's facing direction reads clearly at a glance
  const noseConeFuselage = new THREE.Mesh(new THREE.ConeGeometry(0.8, 7.0, 6), hullMaterial)
  noseConeFuselage.rotation.x = -Math.PI / 2 // cone points -Z, tip now ~3.5 m ahead
  playerShipGroup.add(noseConeFuselage)

  // D25: swept delta wings that flare outward toward the TAIL (a narrow leading edge near the
  // nose widening to a broad trailing edge at the back) instead of the old square box wing
  const sweptDeltaWings = new THREE.Mesh(buildSweptDeltaWingGeometry(), accentMaterial)
  playerShipGroup.add(sweptDeltaWings)

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
