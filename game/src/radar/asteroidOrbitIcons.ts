import { Quaternion, Vector3 } from 'three'
import type { AsteroidBody } from '../gameSimulation/gameWorldTypes'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'
import { classifyAsteroidGrappleEligibility } from '../grappleOrbit/asteroidGrappleEligibility'
import './asteroidOrbitIcons.css'

// D60/D102: DOM icons around the radar RIM — one per in-range asteroid. D102 gates GRAPPLEABILITY by
// travel geometry (only rocks at/behind the perpendicular travel plane, within 45° of it, are tappable
// — see asteroidGrappleEligibility). Rocks still APPROACHING in front show GREY and blink in their
// distance color as they get close (not tappable yet). Closer icons layer over farther ones (z-index),
// for both visuals and touch. The visible circle is colored yellow→orange→red by closeness.

export const MIN_ORBIT_SURFACE_DISTANCE_METERS = 14 // closer than this is too tight to orbit (black, untappable)
export const MAX_ORBIT_RANGE_METERS = 1200 // D66: orbit from twice as far to start
const RIM_OFFSET_PERCENT = 46 // icon sits this far from the scope center toward the rim
const APPROACHING_BLINK_CLOSENESS = 0.5 // an approaching (in-front) rock blinks once it's at least this close

/** D117: the rim-icon distance color (yellow at max range → red at the min). Exported so the GRAPPLE
 *  control button can show the exact same color as the rock it targets. */
export function computeAsteroidDistanceColorHsl(surfaceDistanceMeters: number): string {
  const closenessFraction = Math.max(
    0,
    Math.min(
      1,
      1 - (surfaceDistanceMeters - MIN_ORBIT_SURFACE_DISTANCE_METERS) / (MAX_ORBIT_RANGE_METERS - MIN_ORBIT_SURFACE_DISTANCE_METERS),
    ),
  )
  return `hsl(${60 * (1 - closenessFraction)}, 100%, 55%)`
}

export type AsteroidOrbitIcons = {
  updateAsteroidOrbitIcons(
    asteroids: readonly AsteroidBody[],
    playerShipState: ShipRigidBodyState,
    commandedOrientation: Quaternion,
    latchedAsteroidId: number | null,
  ): void
  /** D102/intro: hide + disable ALL rim icons (used by the pre-wave-1 intro to gate them on/off) */
  setIconsGloballyHidden(hidden: boolean): void
}

type AsteroidIconEntry = {
  element: HTMLDivElement
  asteroid: AsteroidBody
}

const ICON_STATE_CLASSES = [
  'asteroidOrbitIconGrappleable',
  'asteroidOrbitIconApproaching',
  'asteroidOrbitIconApproachingBlink',
  'asteroidOrbitIconUnreachable',
  'asteroidOrbitIconTooClose',
]

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

  function setIconState(element: HTMLDivElement, stateClass: string): void {
    for (const cls of ICON_STATE_CLASSES) element.classList.toggle(cls, cls === stateClass)
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
        // D102: closer icons layer OVER farther ones (visual + touch) — higher z for nearer rocks
        element.style.zIndex = `${Math.max(1, Math.round(100000 - centerDistanceMeters))}`

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
        const distanceColorHsl = computeAsteroidDistanceColorHsl(surfaceDistanceMeters) // D117: shared formula
        element.style.setProperty('--asteroid-distance-color', distanceColorHsl)

        // D113: the LATCHED asteroid stays colored + highlighted while grappled — skip the eligibility
        // grey/blink logic (the orbit carries it across the perpendicular plane, which would otherwise
        // make its icon flicker between states).
        const isLatchedAsteroid = asteroid.asteroidId === latchedAsteroidId
        const eligibility = classifyAsteroidGrappleEligibility(
          playerShipState.positionMeters,
          asteroid.positionMeters,
          playerShipState.velocityMetersPerSecond,
        )
        if (isLatchedAsteroid) {
          element.style.setProperty('--asteroid-icon-color', distanceColorHsl)
          setIconState(element, 'asteroidOrbitIconGrappleable')
        } else if (surfaceDistanceMeters < MIN_ORBIT_SURFACE_DISTANCE_METERS) {
          setIconState(element, 'asteroidOrbitIconTooClose') // too tight to orbit
        } else if (eligibility === 'grappleable') {
          element.style.setProperty('--asteroid-icon-color', distanceColorHsl)
          setIconState(element, 'asteroidOrbitIconGrappleable') // tappable
        } else if (eligibility === 'approachingInFront') {
          // grey while still ahead; blink in its distance color once it's getting close (not tappable yet)
          setIconState(
            element,
            closenessFraction >= APPROACHING_BLINK_CLOSENESS
              ? 'asteroidOrbitIconApproachingBlink'
              : 'asteroidOrbitIconApproaching',
          )
        } else {
          // passed behind the 45° window (or no travel) — grey, not grappleable
          setIconState(element, 'asteroidOrbitIconUnreachable')
        }
        element.classList.toggle('asteroidOrbitIconLatched', isLatchedAsteroid)
      }

      // remove icons for asteroids that went out of range or were destroyed
      for (const [asteroidId, entry] of iconByAsteroidId) {
        if (visibleAsteroidIds.has(asteroidId)) continue
        iconLayer.removeChild(entry.element)
        iconByAsteroidId.delete(asteroidId)
      }
    },
    setIconsGloballyHidden(hidden: boolean): void {
      iconLayer.style.display = hidden ? 'none' : ''
    },
  }
}
