import './shipTrajectoryAndSpeedIndicator.css'
import { Quaternion, Vector3 } from 'three'

// D86: bottom-right "trajectory + speed" cluster on the ship view.
//  - A small 3D-aware TRAJECTORY ARROW that points in the direction the ship is actually travelling,
//    expressed RELATIVE TO THE CURRENT VIEW: world velocity is rotated into camera-local space, the
//    in-screen-plane component sets the arrow's heading, and the toward/away component foreshortens it
//    (a centered dot shows when travel is nearly straight into/out of the screen). Labelled "trajectory".
//  - A simple horizontal SPEED BAR under the arrow that reads FULL when the ship is at its current
//    max (cruise) speed — it deliberately does NOT grow with speed upgrades (the bar is a "you're at
//    cruise" gauge, constant by design). The actual speed in m/s is printed under the bar, so a speed
//    upgrade shows up as a higher m/s number while the bar stays full.
// Purely presentational — not a control.

export type ShipTrajectoryAndSpeedIndicator = {
  /**
   * @param worldTravelVelocity        ship velocity vector in world space (m/s)
   * @param viewCameraWorldOrientation current view camera world orientation (to map travel into view space)
   * @param currentMaxSpeedMetersPerSecond the ship's present cruise (max) speed — bar reads full at this value
   */
  updateShipTrajectoryAndSpeedIndicator(
    worldTravelVelocity: Vector3,
    viewCameraWorldOrientation: Quaternion,
    currentMaxSpeedMetersPerSecond: number,
  ): void
}

// arrow SVG points "up" (toward -Y screen / north) at rest; CSS rotation aims it.
const TRAJECTORY_ARROW_SVG_MARKUP =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<path d="M12 2 L19 19 L12 15 L5 19 Z" fill="currentColor"/>' +
  '</svg>'

// below this in-screen-plane magnitude (0..1) the travel is mostly into/out of the screen, so the
// arrow is too foreshortened to read a heading — show the head-on dot instead.
const HEAD_ON_INPLANE_MAGNITUDE_THRESHOLD = 0.22

export function createShipTrajectoryAndSpeedIndicator(
  viewHudOverlay: HTMLElement,
  scratchTravelDirectionInViewSpace: Vector3,
): ShipTrajectoryAndSpeedIndicator {
  const cluster = document.createElement('div')
  cluster.className = 'trajectorySpeedCluster'

  const arrowFrame = document.createElement('div')
  arrowFrame.className = 'trajectoryArrowFrame'
  const arrowGlyph = document.createElement('div')
  arrowGlyph.className = 'trajectoryArrowGlyph'
  arrowGlyph.innerHTML = TRAJECTORY_ARROW_SVG_MARKUP
  const arrowHeadOnDot = document.createElement('div')
  arrowHeadOnDot.className = 'trajectoryHeadOnDot'
  arrowFrame.appendChild(arrowGlyph)
  arrowFrame.appendChild(arrowHeadOnDot)
  cluster.appendChild(arrowFrame)

  const arrowLabel = document.createElement('div')
  arrowLabel.className = 'trajectoryLabel'
  arrowLabel.textContent = 'trajectory'
  cluster.appendChild(arrowLabel)

  const speedBarTrack = document.createElement('div')
  speedBarTrack.className = 'speedBarTrack'
  const speedBarFill = document.createElement('div')
  speedBarFill.className = 'speedBarFill'
  speedBarTrack.appendChild(speedBarFill)
  cluster.appendChild(speedBarTrack)

  const speedReadout = document.createElement('div')
  speedReadout.className = 'speedReadout'
  speedReadout.textContent = '0 m/s'
  cluster.appendChild(speedReadout)

  viewHudOverlay.appendChild(cluster)

  return {
    updateShipTrajectoryAndSpeedIndicator(
      worldTravelVelocity,
      viewCameraWorldOrientation,
      currentMaxSpeedMetersPerSecond,
    ): void {
      const currentSpeedMetersPerSecond = worldTravelVelocity.length()

      // speed bar: full at cruise max; m/s shows the real (upgrade-scaled) value
      const speedBarFraction =
        currentMaxSpeedMetersPerSecond > 1e-6
          ? Math.max(0, Math.min(1, currentSpeedMetersPerSecond / currentMaxSpeedMetersPerSecond))
          : 0
      speedBarFill.style.width = `${speedBarFraction * 100}%`
      speedReadout.textContent = `${Math.round(currentSpeedMetersPerSecond)} m/s`

      if (currentSpeedMetersPerSecond < 1e-3) {
        // at rest: no meaningful heading — show the head-on dot, hide the arrow
        arrowGlyph.style.opacity = '0'
        arrowHeadOnDot.style.opacity = '0.5'
        return
      }

      // map world travel direction into the current view's local space
      scratchTravelDirectionInViewSpace
        .copy(worldTravelVelocity)
        .normalize()
        .applyQuaternion(scratchViewSpaceInverseOrientation(viewCameraWorldOrientation))

      // camera-local axes: +x right, +y up, -z into screen (forward). screen-plane vector = (x, y).
      const inScreenPlaneX = scratchTravelDirectionInViewSpace.x
      const inScreenPlaneY = scratchTravelDirectionInViewSpace.y
      const inScreenPlaneMagnitude = Math.hypot(inScreenPlaneX, inScreenPlaneY)

      if (inScreenPlaneMagnitude < HEAD_ON_INPLANE_MAGNITUDE_THRESHOLD) {
        // travelling roughly into/out of the screen — heading is not meaningful on screen
        arrowGlyph.style.opacity = '0'
        arrowHeadOnDot.style.opacity = '0.85'
        return
      }
      arrowHeadOnDot.style.opacity = '0'
      arrowGlyph.style.opacity = '1'

      // CSS rotation: SVG points up (screen -Y). screen +Y is DOWN, so travel-up means localY>0.
      // angle clockwise-from-up = atan2(screenRight, screenUp) = atan2(x, y_up) where y_up = +localY.
      const headingDegreesClockwiseFromUp = (Math.atan2(inScreenPlaneX, inScreenPlaneY) * 180) / Math.PI
      // foreshorten toward the head-on dot as travel tilts into/out of the screen (3D cue)
      const foreshortenScale = 0.45 + 0.55 * inScreenPlaneMagnitude
      arrowGlyph.style.transform = `rotate(${headingDegreesClockwiseFromUp}deg) scaleY(${foreshortenScale.toFixed(3)})`
    },
  }
}

// reused inverse-orientation quaternion so we never allocate per frame
const reusableInverseViewOrientation = new Quaternion()
function scratchViewSpaceInverseOrientation(viewCameraWorldOrientation: Quaternion): Quaternion {
  return reusableInverseViewOrientation.copy(viewCameraWorldOrientation).invert()
}
