import * as THREE from 'three'

// D30: a procedurally generated, exaggerated colored "space phenomenon" nebula used as the scene
// background (scene.background = this equirectangular texture). No image files (A1) — it's drawn
// once to a 2D canvas at startup from a fixed seed (no Math.random, so the sky is identical every
// run) and uploaded as a CanvasTexture. It also visibly lightens the previously near-black void.

const NEBULA_TEXTURE_WIDTH_PIXELS = 2048
const NEBULA_TEXTURE_HEIGHT_PIXELS = 1024

// deterministic 0..1 pseudo-random generator (seeded LCG) so the sky never changes between runs
function createSeededRandom(seed: number): () => number {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return function nextRandomUnitFraction(): number {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

const NEBULA_CLOUD_COLORS = [
  'rgba(120, 40, 180, 0.55)', // violet
  'rgba(40, 120, 200, 0.5)', // blue
  'rgba(200, 60, 130, 0.45)', // magenta
  'rgba(40, 180, 170, 0.4)', // teal
  'rgba(210, 120, 40, 0.35)', // warm amber
]

export function createProceduralSpaceNebulaTexture(): THREE.Texture {
  const nebulaCanvas = document.createElement('canvas')
  nebulaCanvas.width = NEBULA_TEXTURE_WIDTH_PIXELS
  nebulaCanvas.height = NEBULA_TEXTURE_HEIGHT_PIXELS
  const drawingContext = nebulaCanvas.getContext('2d')!

  // STEP 1: base deep-space gradient — lifted off pure black toward a dim blue/indigo so the scene
  // no longer reads as flat dark
  const baseGradient = drawingContext.createLinearGradient(0, 0, 0, NEBULA_TEXTURE_HEIGHT_PIXELS)
  baseGradient.addColorStop(0, '#0c1430')
  baseGradient.addColorStop(0.5, '#161033')
  baseGradient.addColorStop(1, '#0a1428')
  drawingContext.fillStyle = baseGradient
  drawingContext.fillRect(0, 0, NEBULA_TEXTURE_WIDTH_PIXELS, NEBULA_TEXTURE_HEIGHT_PIXELS)

  const seededRandom = createSeededRandom(1337)

  // STEP 2: big soft colored nebula clouds, blended additively ('lighter') for a glowing look
  drawingContext.globalCompositeOperation = 'lighter'
  const nebulaCloudCount = 26
  for (let cloudIndex = 0; cloudIndex < nebulaCloudCount; cloudIndex++) {
    const centerX = seededRandom() * NEBULA_TEXTURE_WIDTH_PIXELS
    const centerY = seededRandom() * NEBULA_TEXTURE_HEIGHT_PIXELS
    const cloudRadius = 140 + seededRandom() * 420
    const cloudColor = NEBULA_CLOUD_COLORS[Math.floor(seededRandom() * NEBULA_CLOUD_COLORS.length)]
    const cloudGradient = drawingContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, cloudRadius)
    cloudGradient.addColorStop(0, cloudColor)
    cloudGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    drawingContext.fillStyle = cloudGradient
    drawingContext.fillRect(0, 0, NEBULA_TEXTURE_WIDTH_PIXELS, NEBULA_TEXTURE_HEIGHT_PIXELS)
  }

  // STEP 3: scatter stars — many faint, a few bright
  const starCount = 1400
  for (let starIndex = 0; starIndex < starCount; starIndex++) {
    const starX = seededRandom() * NEBULA_TEXTURE_WIDTH_PIXELS
    const starY = seededRandom() * NEBULA_TEXTURE_HEIGHT_PIXELS
    const starBrightness = seededRandom()
    const starRadius = starBrightness > 0.97 ? 1.8 : 0.9
    drawingContext.fillStyle = `rgba(255, 255, 255, ${0.25 + starBrightness * 0.65})`
    drawingContext.beginPath()
    drawingContext.arc(starX, starY, starRadius, 0, Math.PI * 2)
    drawingContext.fill()
  }
  drawingContext.globalCompositeOperation = 'source-over'

  const nebulaTexture = new THREE.CanvasTexture(nebulaCanvas)
  nebulaTexture.mapping = THREE.EquirectangularReflectionMapping
  nebulaTexture.colorSpace = THREE.SRGBColorSpace
  return nebulaTexture
}
