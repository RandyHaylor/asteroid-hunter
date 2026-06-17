import { Quaternion, Vector3 } from 'three'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'
import './asteroidOrbitIcons.css'

// D60: DOM icons around the radar RIM — one per in-range asteroid you can slingshot around. Each icon
// is placed at the asteroid's bearing (projected into the commanded/camera frame, snapped to the rim)
// and colored yellow→orange→red as it gets closer (closer = a tighter, stronger slingshot). Too close
// to orbit → black + untappable; too far → hidden. Tapping an icon drives the grapple controller.

const MIN_ORBIT_SURFACE_DISTANCE_METERS = 14 // closer than this is too tight to orbit (black, untappable)
const MAX_ORBIT_RANGE_METERS = 1200 // D66: doubled (was 600) — orbit from twice as far to start
const RIM_OFFSET_PERCENT = 46 // icon sits this far from the scope center toward the rim

export type AsteroidOrbitIcons = {
  updateAsteroidOrbitIcons(
    asteroids: readonly AsteroidBody[],
    playerShipState: ShipRigidBodyState,
    commandedOrientation: Quaternion,
    latchedAsteroidId: number | null,
  ): void
}

type AsteroidIconEntry = {
  element: HTMLDivElement
  asteroid: AsteroidBody
}

export function createAsteroidOrbitIcons(
  radarControlZone: HTMLElement,
  onAsteroidPressed: (asteroid: AsteroidBody) => void,
  onAsteroidReleased: (asteroid: AsteroidBody) => void,
): AsteroidOrbitIcons {
  const iconLayer = document.createElement('div')
  iconLayer.className = 'asteroidOrbitIconLayer'
  radarControlZone.appendChild(iconLayer)

  const iconByAsteroidId = new Map<number, AsteroidIconEntry>()
  const scratchInverseCommandedOrientation = new Quaternion()
  const scratchBearingDirection = new Vector3()

  function acquireIcon(asteroid: AsteroidBody): AsteroidIconEntry {
    const existing = iconByAsteroidId.get(asteroid.asteroidId)
    if (existing) {
      existing.asteroid = asteroid
      return existing
    }
    const element = document.createElement('div')
    element.className = 'asteroidOrbitIcon'
    const entry: AsteroidIconEntry = { element, asteroid }
    element.addEventListener('pointerdown', (pointerEvent) => {
      pointerEvent.stopPropagation()
      element.setPointerCapture(pointerEvent.pointerId)
      onAsteroidPressed(entry.asteroid)
    })
    const handleRelease = (): void => onAsteroidReleased(entry.asteroid)
    element.addEventListener('pointerup', handleRelease)
    element.addEventListener('pointercancel', handleRelease)
    iconLayer.appendChild(element)
    iconByAsteroidId.set(asteroid.asteroidId, entry)
    return entry
  }

  return {
    updateAsteroidOrbitIcons(asteroids, playerShipState, commandedOrientation, latchedAsteroidId): void {
      scratchInverseCommandedOrientation.copy(commandedOrientation).invert()
      const visibleAsteroidIds = new Set<number>()

      for (const asteroid of asteroids) {
        if (asteroid.isDestroyed) continue
        if (asteroid.sizeClass !== 'large') continue // only the big rocks are worth slingshotting around
        scratchBearingDirection.copy(asteroid.positionMeters).sub(playerShipState.positionMeters)
        const centerDistanceMeters = scratchBearingDirection.length()
        if (centerDistanceMeters <= 1e-3) continue
        const surfaceDistanceMeters = centerDistanceMeters - asteroid.currentRadiusMeters
        if (surfaceDistanceMeters > MAX_ORBIT_RANGE_METERS) continue // too far → hidden

        const entry = acquireIcon(asteroid)
        visibleAsteroidIds.add(asteroid.asteroidId)
        const element = entry.element

        // bearing in the commanded (camera) frame → screen-plane direction (x = right, y = up)
        scratchBearingDirection.applyQuaternion(scratchInverseCommandedOrientation)
        let screenX = scratchBearingDirection.x
        let screenY = scratchBearingDirection.y
        const planarMagnitude = Math.hypot(screenX, screenY)
        if (planarMagnitude < 1e-4) {
          screenX = 0
          screenY = 1 // dead-ahead/behind → park at the top of the rim
        } else {
          screenX /= planarMagnitude
          screenY /= planarMagnitude
        }
        element.style.left = `${50 + RIM_OFFSET_PERCENT * screenX}%`
        element.style.top = `${50 - RIM_OFFSET_PERCENT * screenY}%`

        const isTooCloseToOrbit = surfaceDistanceMeters < MIN_ORBIT_SURFACE_DISTANCE_METERS
        if (isTooCloseToOrbit) {
          element.style.background = '#101010'
          element.style.borderColor = '#333333'
          element.style.pointerEvents = 'none'
        } else {
          // closeness 0 at max range (yellow, hue 60°) → 1 at the min (red, hue 0°)
          const closenessFraction = Math.max(
            0,
            Math.min(
              1,
              1 -
                (surfaceDistanceMeters - MIN_ORBIT_SURFACE_DISTANCE_METERS) /
                  (MAX_ORBIT_RANGE_METERS - MIN_ORBIT_SURFACE_DISTANCE_METERS),
            ),
          )
          element.style.background = `hsl(${60 * (1 - closenessFraction)}, 100%, 55%)`
          element.style.borderColor = 'rgba(255, 255, 255, 0.85)'
          element.style.pointerEvents = 'auto'
        }
        element.classList.toggle('asteroidOrbitIconLatched', asteroid.asteroidId === latchedAsteroidId)
      }

      // remove icons for asteroids that went out of range or were destroyed
      for (const [asteroidId, entry] of iconByAsteroidId) {
        if (visibleAsteroidIds.has(asteroidId)) continue
        iconLayer.removeChild(entry.element)
        iconByAsteroidId.delete(asteroidId)
      }
    },
  }
}
