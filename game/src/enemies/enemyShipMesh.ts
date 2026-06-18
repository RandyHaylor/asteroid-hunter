import * as THREE from 'three'
import type { EnemyShipBehaviorTier } from '../gameSimulation/gameWorldTypes'

// R1/R2: low-poly menacing alien craft built from primitives, clearly distinct from the friendly dart.
// D70: each behavior tier is now a DISTINCT archetype with its own silhouette + accent color so the
// three enemy types read apart at a glance (Drone / Raider / Stalker). Forward = -Z.

const ALIEN_HULL_COLOR = 0x3a2a3a

// D56/D69: enemy models are scaled well up from the ~5 m base build so they read clearly vs the dart.
// (Hit radius + bar clearance + preview framing track this in laserFire/missileFire/condition bars.)
export const ENEMY_SHIP_MODEL_SCALE = 9

// D70: per-archetype visual config (keyed by behavior tier). accentColor = emissive glow; sizeMultiplier
// scales the whole craft relative to the shared base scale; the boolean flags toggle silhouette parts.
type EnemyArchetypeVisualConfig = {
  accentGlowColor: number
  sizeMultiplier: number
  hasSweptSidePods: boolean
  hasWingFins: boolean
  hasDorsalBlade: boolean
  hasArmorPlates: boolean
  coreBodyScale: [number, number, number]
}
const ENEMY_ARCHETYPE_VISUAL_CONFIGS: Record<EnemyShipBehaviorTier, EnemyArchetypeVisualConfig> = {
  // Drone (dumbPatrol): smallest + simplest — compact core, green glow, no pods/fins. Basic fodder.
  dumbPatrol: {
    accentGlowColor: 0x66ff44,
    sizeMultiplier: 0.7,
    hasSweptSidePods: false,
    hasWingFins: false,
    hasDorsalBlade: false,
    hasArmorPlates: false,
    coreBodyScale: [1.0, 0.9, 1.8],
  },
  // Raider (orbitStrafe): sleek + fast — stretched core, twin swept pods + wing fins, amber glow.
  orbitStrafe: {
    accentGlowColor: 0xffaa33,
    sizeMultiplier: 1.0,
    hasSweptSidePods: true,
    hasWingFins: true,
    hasDorsalBlade: false,
    coreBodyScale: [1.0, 0.6, 2.8],
    hasArmorPlates: false,
  },
  // Stalker (coverHunter): bulky + armored — heavy core, dorsal blade + armor plates, red glow.
  coverHunter: {
    accentGlowColor: 0xff4422,
    sizeMultiplier: 1.4,
    hasSweptSidePods: true,
    hasWingFins: false,
    hasDorsalBlade: true,
    hasArmorPlates: true,
    coreBodyScale: [1.4, 1.1, 2.2],
  },
}

export function createEnemyShipMesh(behaviorTier: EnemyShipBehaviorTier = 'dumbPatrol'): THREE.Group {
  const visualConfig = ENEMY_ARCHETYPE_VISUAL_CONFIGS[behaviorTier]
  const enemyShipGroup = new THREE.Group()

  const darkHullMaterial = new THREE.MeshStandardMaterial({ color: ALIEN_HULL_COLOR, flatShading: true })
  const accentGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0x101010,
    emissive: visualConfig.accentGlowColor,
    emissiveIntensity: 1.8,
  })

  // angular octahedron core stretched along Z into a spearhead body (proportions vary per archetype)
  const angularCoreBody = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), darkHullMaterial)
  angularCoreBody.scale.set(...visualConfig.coreBodyScale)
  enemyShipGroup.add(angularCoreBody)

  if (visualConfig.hasSweptSidePods) {
    for (const podSideSign of [-1, 1]) {
      const sweptSidePod = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.6, 4), darkHullMaterial)
      sweptSidePod.position.set(podSideSign * 1.7, 0, 0.7)
      sweptSidePod.rotation.x = Math.PI / 2 // cone tip points +Z (swept back)
      enemyShipGroup.add(sweptSidePod)

      const podMuzzleGlow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), accentGlowMaterial)
      podMuzzleGlow.position.set(podSideSign * 1.7, 0, -0.7)
      enemyShipGroup.add(podMuzzleGlow)
    }
  }

  if (visualConfig.hasWingFins) {
    for (const wingSideSign of [-1, 1]) {
      const sweptWingFin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.0), darkHullMaterial)
      sweptWingFin.position.set(wingSideSign * 1.9, 0, 0.6)
      sweptWingFin.rotation.z = wingSideSign * -0.25
      enemyShipGroup.add(sweptWingFin)
    }
  }

  if (visualConfig.hasArmorPlates) {
    for (const plateSideSign of [-1, 1]) {
      const hullArmorPlate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 2.2), darkHullMaterial)
      hullArmorPlate.position.set(plateSideSign * 1.1, 0, 0.2)
      enemyShipGroup.add(hullArmorPlate)
    }
  }

  // narrow glowing "eye" slit near the nose so the ship reads hostile head-on (all archetypes)
  const menacingEyeSlit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3), accentGlowMaterial)
  menacingEyeSlit.position.set(0, 0.25, -1.3)
  enemyShipGroup.add(menacingEyeSlit)

  // aft drive glow (all archetypes)
  const engineExhaustGlow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), accentGlowMaterial)
  engineExhaustGlow.position.set(0, 0, 2.3)
  engineExhaustGlow.scale.z = 0.6
  enemyShipGroup.add(engineExhaustGlow)

  if (visualConfig.hasDorsalBlade) {
    const dorsalBladeFin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 1.9), darkHullMaterial)
    dorsalBladeFin.position.set(0, 1.0, 0.9)
    dorsalBladeFin.rotation.x = -0.35
    enemyShipGroup.add(dorsalBladeFin)
  }

  enemyShipGroup.scale.setScalar(ENEMY_SHIP_MODEL_SCALE * visualConfig.sizeMultiplier)
  return enemyShipGroup
}
