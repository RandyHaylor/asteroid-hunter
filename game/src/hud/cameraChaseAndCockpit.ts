import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'

// D9: third-person chase camera (default) + toggleable cockpit view.
// D55-fix: a RIGID chase rig. The camera orientation IS the commanded (radar) orientation, and the
// camera sits at a fixed offset behind+above the ship — so the ship is always pinned the same
// distance in front of the camera and slightly below center. Rotating the radar orbits the whole rig
// around the ship (the ship is the pivot — it never swims closer/farther and never flops off-center).
// The ship's OWN facing is set in main.ts (= the camera heading, or the fire-ahead lead when locked).

export type PlayerCameraViewMode = 'thirdPersonChase' | 'cockpit'

// +y lifts the camera above the ship and +z sets it behind, so with the camera looking straight along
// the commanded heading the ship rides in front of it and slightly below screen center.
const CHASE_CAMERA_LOCAL_OFFSET = new Vector3(0, 5, 18)
const COCKPIT_CAMERA_LOCAL_OFFSET = new Vector3(0, 0.45, -1.2)

const scratchCameraPosition = new Vector3()

export type PlayerCameraRig = {
  /** viewOrientation = the commanded (radar) orientation; the camera adopts it rigidly (D55-fix) */
  updateCameraFollowingShip(shipState: ShipRigidBodyState, viewOrientation: Quaternion): void
  toggleCameraViewMode(): PlayerCameraViewMode
  getCameraViewMode(): PlayerCameraViewMode
}

export function createPlayerCameraRig(playerViewCamera: PerspectiveCamera): PlayerCameraRig {
  let cameraViewMode: PlayerCameraViewMode = 'thirdPersonChase'

  function placeCameraRigidly(
    shipState: ShipRigidBodyState,
    viewOrientation: Quaternion,
    localOffset: Vector3,
  ): void {
    scratchCameraPosition.copy(localOffset).applyQuaternion(viewOrientation).add(shipState.positionMeters)
    playerViewCamera.position.copy(scratchCameraPosition)
    playerViewCamera.quaternion.copy(viewOrientation)
  }

  return {
    updateCameraFollowingShip(shipState: ShipRigidBodyState, viewOrientation: Quaternion): void {
      const localOffset =
        cameraViewMode === 'cockpit' ? COCKPIT_CAMERA_LOCAL_OFFSET : CHASE_CAMERA_LOCAL_OFFSET
      placeCameraRigidly(shipState, viewOrientation, localOffset)
    },
    toggleCameraViewMode(): PlayerCameraViewMode {
      cameraViewMode = cameraViewMode === 'thirdPersonChase' ? 'cockpit' : 'thirdPersonChase'
      return cameraViewMode
    },
    getCameraViewMode(): PlayerCameraViewMode {
      return cameraViewMode
    },
  }
}
