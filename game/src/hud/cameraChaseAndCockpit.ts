import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { ShipRigidBodyState } from '../gameSimulation/newtonianShipPhysics'
import { getShipForwardDirection } from '../gameSimulation/newtonianShipPhysics'

// D9: third-person chase camera is the default, with a toggleable cockpit view.

export type PlayerCameraViewMode = 'thirdPersonChase' | 'cockpit'

const CHASE_CAMERA_LOCAL_OFFSET = new Vector3(0, 3.5, 11)
const CHASE_LOOK_AHEAD_DISTANCE_METERS = 30
/** higher = snappier follow; applied frame-rate independently via exponential damping */
const CHASE_FOLLOW_STIFFNESS_PER_SECOND = 5

const COCKPIT_CAMERA_LOCAL_OFFSET = new Vector3(0, 0.45, -1.2)

const scratchDesiredCameraPosition = new Vector3()
const scratchLookTargetPosition = new Vector3()
const scratchForwardDirection = new Vector3()
const scratchSmoothedOrientation = new Quaternion()
const scratchBankedUpDirection = new Vector3()

const SHIP_LOCAL_UP_AXIS = new Vector3(0, 1, 0)

export type PlayerCameraRig = {
  updateCameraFollowingShip(shipState: ShipRigidBodyState, deltaSeconds: number): void
  toggleCameraViewMode(): PlayerCameraViewMode
  getCameraViewMode(): PlayerCameraViewMode
}

export function createPlayerCameraRig(playerViewCamera: PerspectiveCamera): PlayerCameraRig {
  let cameraHasSnappedToInitialPose = false
  let cameraViewMode: PlayerCameraViewMode = 'thirdPersonChase'

  function updateChaseCamera(shipState: ShipRigidBodyState, deltaSeconds: number): void {
    // smooth the orientation the camera follows so fast turns feel weighty instead of rigid
    const orientationBlend = 1 - Math.exp(-CHASE_FOLLOW_STIFFNESS_PER_SECOND * deltaSeconds)
    scratchSmoothedOrientation.slerp(shipState.orientation, cameraHasSnappedToInitialPose ? orientationBlend : 1)

    scratchDesiredCameraPosition
      .copy(CHASE_CAMERA_LOCAL_OFFSET)
      .applyQuaternion(scratchSmoothedOrientation)
      .add(shipState.positionMeters)

    if (cameraHasSnappedToInitialPose) {
      const positionBlend = 1 - Math.exp(-CHASE_FOLLOW_STIFFNESS_PER_SECOND * deltaSeconds)
      playerViewCamera.position.lerp(scratchDesiredCameraPosition, positionBlend)
    } else {
      playerViewCamera.position.copy(scratchDesiredCameraPosition)
      cameraHasSnappedToInitialPose = true
    }

    // the camera's up follows the ship's banked up axis — controls never invert when flying
    // upside down because "up" on screen is always the ship's up, not the world's
    scratchBankedUpDirection.copy(SHIP_LOCAL_UP_AXIS).applyQuaternion(scratchSmoothedOrientation)
    playerViewCamera.up.copy(scratchBankedUpDirection)

    getShipForwardDirection(shipState, scratchForwardDirection)
    scratchLookTargetPosition
      .copy(shipState.positionMeters)
      .addScaledVector(scratchForwardDirection, CHASE_LOOK_AHEAD_DISTANCE_METERS)
    playerViewCamera.lookAt(scratchLookTargetPosition)
  }

  function updateCockpitCamera(shipState: ShipRigidBodyState): void {
    // rigid mount at the ship's nose: camera looks -Z by default, matching the ship's forward axis
    scratchDesiredCameraPosition
      .copy(COCKPIT_CAMERA_LOCAL_OFFSET)
      .applyQuaternion(shipState.orientation)
      .add(shipState.positionMeters)
    playerViewCamera.position.copy(scratchDesiredCameraPosition)
    playerViewCamera.quaternion.copy(shipState.orientation)
  }

  return {
    updateCameraFollowingShip(shipState: ShipRigidBodyState, deltaSeconds: number): void {
      if (cameraViewMode === 'cockpit') {
        updateCockpitCamera(shipState)
      } else {
        updateChaseCamera(shipState, deltaSeconds)
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
  }
}
