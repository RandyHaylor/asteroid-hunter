import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'

// D9: third-person chase camera is the default, with a toggleable cockpit view.
// D43: the camera's ORIENTATION follows the player's COMMANDED (radar) orientation and snaps to it
// instantly when the radar is rotated — only the camera POSITION is smoothed. The ship lags behind
// the commanded heading (it slews toward it), so during a turn the ship visibly rotates within view.

export type PlayerCameraViewMode = 'thirdPersonChase' | 'cockpit'

// D26/D34: raised above the ship for a mild top-down angle, and pulled ~1.6× farther back (D34) so
// the ship and asteroids read smaller / less crowded on screen (the y:z ratio keeps the same tilt).
const CHASE_CAMERA_LOCAL_OFFSET = new Vector3(0, 8.5, 18)
const CHASE_LOOK_AHEAD_DISTANCE_METERS = 30
/** higher = snappier follow; applied frame-rate independently via exponential damping */
const CHASE_FOLLOW_STIFFNESS_PER_SECOND = 5

/** D18: while tractored to an asteroid the chase view pulls back so the rock doesn't fill the screen */
const COVER_CAMERA_ZOOM_OUT_FACTOR = 2.6
const COVER_ZOOM_RESPONSE_PER_SECOND = 3

const COCKPIT_CAMERA_LOCAL_OFFSET = new Vector3(0, 0.45, -1.2)

const scratchDesiredCameraPosition = new Vector3()
const scratchLookTargetPosition = new Vector3()
const scratchForwardDirection = new Vector3()
const scratchBankedUpDirection = new Vector3()

const SHIP_LOCAL_UP_AXIS = new Vector3(0, 1, 0)
const SHIP_LOCAL_FORWARD_AXIS = new Vector3(0, 0, -1)

export type PlayerCameraRig = {
  /** viewOrientation = the commanded (radar) orientation the camera aligns to instantly (D43) */
  updateCameraFollowingShip(
    shipState: ShipRigidBodyState,
    viewOrientation: Quaternion,
    deltaSeconds: number,
  ): void
  toggleCameraViewMode(): PlayerCameraViewMode
  getCameraViewMode(): PlayerCameraViewMode
  /** D18: smoothly zooms the chase view out while the ship is tractored to cover */
  setCoverZoomActive(coverZoomActive: boolean): void
}

export function createPlayerCameraRig(playerViewCamera: PerspectiveCamera): PlayerCameraRig {
  let cameraHasSnappedToInitialPose = false
  let cameraViewMode: PlayerCameraViewMode = 'thirdPersonChase'
  let coverZoomIsActive = false
  let currentZoomFactor = 1

  function updateChaseCamera(
    shipState: ShipRigidBodyState,
    viewOrientation: Quaternion,
    deltaSeconds: number,
  ): void {
    // D43: orientation is the COMMANDED frame, used directly (instant) — no orientation smoothing

    // D18: ease the offset distance toward the cover zoom-out (or back to normal)
    const targetZoomFactor = coverZoomIsActive ? COVER_CAMERA_ZOOM_OUT_FACTOR : 1
    const zoomBlend = 1 - Math.exp(-COVER_ZOOM_RESPONSE_PER_SECOND * deltaSeconds)
    currentZoomFactor += (targetZoomFactor - currentZoomFactor) * zoomBlend

    scratchDesiredCameraPosition
      .copy(CHASE_CAMERA_LOCAL_OFFSET)
      .multiplyScalar(currentZoomFactor)
      .applyQuaternion(viewOrientation)
      .add(shipState.positionMeters)

    // only the camera POSITION is smoothed (so translation isn't jittery as the ship drifts)
    if (cameraHasSnappedToInitialPose) {
      const positionBlend = 1 - Math.exp(-CHASE_FOLLOW_STIFFNESS_PER_SECOND * deltaSeconds)
      playerViewCamera.position.lerp(scratchDesiredCameraPosition, positionBlend)
    } else {
      playerViewCamera.position.copy(scratchDesiredCameraPosition)
      cameraHasSnappedToInitialPose = true
    }

    // up + look direction come from the commanded orientation (instant) so "up" never inverts and
    // the view points where the player aimed the radar
    scratchBankedUpDirection.copy(SHIP_LOCAL_UP_AXIS).applyQuaternion(viewOrientation)
    playerViewCamera.up.copy(scratchBankedUpDirection)

    scratchForwardDirection.copy(SHIP_LOCAL_FORWARD_AXIS).applyQuaternion(viewOrientation)
    scratchLookTargetPosition
      .copy(shipState.positionMeters)
      .addScaledVector(scratchForwardDirection, CHASE_LOOK_AHEAD_DISTANCE_METERS)
    playerViewCamera.lookAt(scratchLookTargetPosition)
  }

  function updateCockpitCamera(shipState: ShipRigidBodyState, viewOrientation: Quaternion): void {
    // D43: cockpit mount follows the commanded orientation too (instant), anchored at the ship
    scratchDesiredCameraPosition
      .copy(COCKPIT_CAMERA_LOCAL_OFFSET)
      .applyQuaternion(viewOrientation)
      .add(shipState.positionMeters)
    playerViewCamera.position.copy(scratchDesiredCameraPosition)
    playerViewCamera.quaternion.copy(viewOrientation)
  }

  return {
    updateCameraFollowingShip(
      shipState: ShipRigidBodyState,
      viewOrientation: Quaternion,
      deltaSeconds: number,
    ): void {
      if (cameraViewMode === 'cockpit') {
        updateCockpitCamera(shipState, viewOrientation)
      } else {
        updateChaseCamera(shipState, viewOrientation, deltaSeconds)
      }
    },
    toggleCameraViewMode(): PlayerCameraViewMode {
      cameraViewMode = cameraViewMode === 'thirdPersonChase' ? 'cockpit' : 'thirdPersonChase'
      cameraHasSnappedToInitialPose = false // re-snap the chase camera when switching back
      return cameraViewMode
    },
    getCameraViewMode(): PlayerCameraViewMode {
      return cameraViewMode
    },
    setCoverZoomActive(coverZoomActive: boolean): void {
      coverZoomIsActive = coverZoomActive
    },
  }
}
