import './shipTrajectoryAndSpeedIndicator.css'
import { ArrowHelper, Color, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer } from 'three'

// D86/D88: bottom-right "trajectory + speed" cluster on the ship view.
//  - A genuine little 3D TRAJECTORY ARROW (rendered with its own tiny three.js view, in the spirit of
//    the 3D radar sphere) that points in the actual direction of travel RELATIVE TO THE CURRENT VIEW:
//    world velocity is rotated into camera-local space and the arrow is aimed along it, so toward/away
//    (depth) is visible as foreshortening — not just a flat 2D heading. Labelled "trajectory".
//  - A horizontal SPEED BAR under it that reads FULL at the ship's max speed and shrinks as the ship
//    slows. Below the low-speed threshold the bar FLASHES RED and a warning banner appears across the
//    bottom of the view. The live speed in m/s prints under the bar.
// Purely presentational — not a control.

const LOW_SPEED_WARNING_TEXT =
  'WARNING: SPEED LOW, TRACTOR DISABLED, VULNERABLE TO ENEMY TRACKING, THRUST IMMEDIATELY'

// the tiny 3D arrow viewport is a fixed little square; DPR-scaled for crispness
const TRAJECTORY_ARROW_VIEWPORT_PIXELS = 44
const TRAJECTORY_ARROW_COLOR = new Color(0x78e6a0)

export type ShipTrajectoryAndSpeedIndicator = {
  /**
   * @param worldTravelVelocity        ship velocity vector in world space (m/s)
   * @param viewCameraWorldOrientation current view camera world orientation (to map travel into view space)
   * @param currentMaxSpeedMetersPerSecond the ship's present max (cruise cap) speed — bar reads full here
   * @param lowSpeedThresholdMetersPerSecond below this the bar flashes red + the warning banner shows
   */
  updateShipTrajectoryAndSpeedIndicator(
    worldTravelVelocity: Vector3,
    viewCameraWorldOrientation: Quaternion,
    currentMaxSpeedMetersPerSecond: number,
    lowSpeedThresholdMetersPerSecond: number,
  ): void
}

export function createShipTrajectoryAndSpeedIndicator(
  viewHudOverlay: HTMLElement,
  scratchTravelDirectionInViewSpace: Vector3,
): ShipTrajectoryAndSpeedIndicator {
  const cluster = document.createElement('div')
  cluster.className = 'trajectorySpeedCluster'

  // --- tiny 3D arrow view (its own three.js scene/renderer, transparent background) ---
  const arrowCanvas = document.createElement('canvas')
  arrowCanvas.className = 'trajectoryArrowCanvas'
  cluster.appendChild(arrowCanvas)

  const arrowRenderer = new WebGLRenderer({ canvas: arrowCanvas, alpha: true, antialias: true })
  arrowRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  arrowRenderer.setSize(TRAJECTORY_ARROW_VIEWPORT_PIXELS, TRAJECTORY_ARROW_VIEWPORT_PIXELS, false)
  const arrowScene = new Scene()
  // mini-camera at +Z looking toward -Z, so camera-local axes match the player's view (x right, y up,
  // -z into the screen). Perspective gives the depth foreshortening that makes the 3D direction read.
  const arrowCamera = new PerspectiveCamera(50, 1, 0.1, 10)
  arrowCamera.position.set(0, 0, 2.7)
  arrowCamera.lookAt(0, 0, 0)
  const trajectoryArrow = new ArrowHelper(new Vector3(0, 0, -1), new Vector3(0, 0, 0), 1, TRAJECTORY_ARROW_COLOR.getHex(), 0.42, 0.32)
  arrowScene.add(trajectoryArrow)

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

  // low-speed warning banner across the bottom of the view (hidden until speed drops below threshold)
  const lowSpeedWarningBanner = document.createElement('div')
  lowSpeedWarningBanner.className = 'lowSpeedWarningBanner'
  lowSpeedWarningBanner.textContent = LOW_SPEED_WARNING_TEXT
  viewHudOverlay.appendChild(lowSpeedWarningBanner)

  const reusableInverseViewOrientation = new Quaternion()

  return {
    updateShipTrajectoryAndSpeedIndicator(
      worldTravelVelocity,
      viewCameraWorldOrientation,
      currentMaxSpeedMetersPerSecond,
      lowSpeedThresholdMetersPerSecond,
    ): void {
      const currentSpeedMetersPerSecond = worldTravelVelocity.length()

      // speed bar: full at max, shrinks as the ship slows; m/s shows the real value
      const speedBarFraction =
        currentMaxSpeedMetersPerSecond > 1e-6
          ? Math.max(0, Math.min(1, currentSpeedMetersPerSecond / currentMaxSpeedMetersPerSecond))
          : 0
      speedBarFill.style.width = `${speedBarFraction * 100}%`
      speedReadout.textContent = `${Math.round(currentSpeedMetersPerSecond)} m/s`

      // low-speed state → flash the bar red + show the warning banner
      const isLowSpeed = currentSpeedMetersPerSecond < lowSpeedThresholdMetersPerSecond
      speedBarFill.classList.toggle('speedBarFillLowFlash', isLowSpeed)
      lowSpeedWarningBanner.classList.toggle('lowSpeedWarningBannerVisible', isLowSpeed)

      // aim the 3D arrow along the travel direction expressed in the player's view space
      if (currentSpeedMetersPerSecond > 1e-3) {
        scratchTravelDirectionInViewSpace
          .copy(worldTravelVelocity)
          .normalize()
          .applyQuaternion(reusableInverseViewOrientation.copy(viewCameraWorldOrientation).invert())
        trajectoryArrow.setDirection(scratchTravelDirectionInViewSpace)
        trajectoryArrow.visible = true
      } else {
        trajectoryArrow.visible = false
      }
      arrowRenderer.render(arrowScene, arrowCamera)
    },
  }
}
