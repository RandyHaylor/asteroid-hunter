import * as THREE from 'three'

// R1: very basic visuals — the player ship is a low-poly dart built from primitives, nose pointing -Z.

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

  return playerShipGroup
}
