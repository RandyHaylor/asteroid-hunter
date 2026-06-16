import * as THREE from 'three'

// R1: very basic visuals — the alien ship is a menacing low-poly craft built from primitives.
// R2: clearly distinct from the friendly dart: dark angular hull with toxic-green emissive accents.
// Forward = -Z, roughly 5 m long to match the player ship scale.

const ALIEN_HULL_COLOR = 0x3a2a3a
const ALIEN_TOXIC_GLOW_COLOR = 0x66ff44

// D56: enemy models are 3× the ~5 m base build so they're clearly visible against the player dart.
export const ENEMY_SHIP_MODEL_SCALE = 3

export function createEnemyShipMesh(): THREE.Group {
  const enemyShipGroup = new THREE.Group()

  const darkHullMaterial = new THREE.MeshStandardMaterial({ color: ALIEN_HULL_COLOR, flatShading: true })
  const toxicGlowMaterial = new THREE.MeshStandardMaterial({
    color: 0x103308,
    emissive: ALIEN_TOXIC_GLOW_COLOR,
    emissiveIntensity: 1.8,
  })

  // angular octahedron core stretched along -Z/+Z into a 5 m spearhead body
  const angularCoreBody = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), darkHullMaterial)
  angularCoreBody.scale.set(1.1, 0.7, 2.5)
  enemyShipGroup.add(angularCoreBody)

  // swept side pods: back-raked cones flanking the core, tips trailing aft
  for (const podSideSign of [-1, 1]) {
    const sweptSidePod = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.6, 4), darkHullMaterial)
    sweptSidePod.position.set(podSideSign * 1.7, 0, 0.7)
    sweptSidePod.rotation.x = Math.PI / 2 // cone tip points +Z (swept back)
    enemyShipGroup.add(sweptSidePod)

    // toxic-green pod muzzle glow facing forward
    const podMuzzleGlow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), toxicGlowMaterial)
    podMuzzleGlow.position.set(podSideSign * 1.7, 0, -0.7)
    enemyShipGroup.add(podMuzzleGlow)
  }

  // narrow glowing "eye" slit near the nose so the ship reads hostile head-on
  const menacingEyeSlit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3), toxicGlowMaterial)
  menacingEyeSlit.position.set(0, 0.25, -1.3)
  enemyShipGroup.add(menacingEyeSlit)

  // aft drive glow
  const engineExhaustGlow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), toxicGlowMaterial)
  engineExhaustGlow.position.set(0, 0, 2.3)
  engineExhaustGlow.scale.z = 0.6
  enemyShipGroup.add(engineExhaustGlow)

  // dorsal blade fin for an aggressive silhouette
  const dorsalBladeFin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 1.6), darkHullMaterial)
  dorsalBladeFin.position.set(0, 0.8, 0.9)
  dorsalBladeFin.rotation.x = -0.35
  enemyShipGroup.add(dorsalBladeFin)

  // D56: enemies are ~3× the player ship so they read clearly (they were often too small to see).
  // The combat hit radius is scaled to match (ENEMY_SHIP_HIT_RADIUS_METERS in laserFire/missileFire).
  enemyShipGroup.scale.setScalar(ENEMY_SHIP_MODEL_SCALE)

  return enemyShipGroup
}
