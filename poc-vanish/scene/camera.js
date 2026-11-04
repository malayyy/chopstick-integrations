import * as THREE from 'three'
import { WINDOW, phase, lerp, clamp01 } from './timeline.js'

/**
 * Camera rig — pure scroll function. Landscape and native portrait 9:16
 * tracks are authored separately so the subject fills the frame in both
 * orientations (no letterboxing, no razor-crop slivers).
 *
 * The 3D pair's lockup crossing point is projected to screen space each
 * frame so the logo overlay can pin the baked sticks centroid onto it.
 */
export class CameraRig {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    this.camera.position.set(0, 0.6, 6.2)
    this.camera.lookAt(0, 0, 0)

    this._tmp = new THREE.Vector3()
    this._q = new THREE.Quaternion()
    this._v = new THREE.Vector3()
    this._m4 = new THREE.Matrix4()
    this._pairCrossing = new THREE.Vector3(0, 0, 0)
  }

  /** Set the pair's lockup crossing point in world space (for logo pinning). */
  setPairCrossing(world) {
    this._pairCrossing.copy(world)
  }

  resize(w, h) {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  update(p, time, portrait) {
    const eLogo = phase(p, WINDOW.logo)
    const eBurst = phase(p, WINDOW.burst)
    const eRest = phase(p, WINDOW.rest)

    // orbit: ornate pair floats in the void; rest pose is the sleek diagonal
    // (f_240); logo pose is the baked chopstick axis (f_300).
    const target = this._tmp
    target.set(
      lerp(-0.35, 0.05, eLogo) + lerp(0.2, -0.1, eRest),
      lerp(-0.75, 0.10, eLogo) + lerp(0.0, 0.0, eRest),
      lerp(6.2, 5.4, eLogo),
    )
    this.camera.position.lerp(target, 0.05)

    // look-at drifts toward the pair's centre of mass, so the frame tracks
    // the subject through the burst and the reconstruction.
    const look = this._v.copy(target).multiplyScalar(0.72)
    look.y += lerp(-0.35, 0.0, eLogo)
    look.z -= 0.9
    this.camera.lookAt(look)

    // native portrait: tighter, slightly lower, and pulled in so the 9:16
    // subject band fills the frame without cropping the tips.
    if (portrait) {
      this.camera.position.y += lerp(0.35, -0.15, eLogo)
      this.camera.position.z -= 0.55
      this.camera.position.x += lerp(0.1, 0.0, eLogo)
    }

    // idle micro-hover (reversible; only affects ambient feel, not beats)
    if (p < WINDOW.burst[0]) {
      this.camera.position.x += Math.sin(time * 0.5) * 0.012
      this.camera.position.y += Math.cos(time * 0.7) * 0.008
    }

    // project the pair crossing point to screen space for the logo pin.
    this._m4.copy(this.camera.matrixWorldInverse)
    this._pairCrossing.applyMatrix4(this._m4)
    // NDC -> screen (0..1)
    this.pairScreen = {
      x: (this._pairCrossing.x + 1) / 2,
      y: (1 - this._pairCrossing.y) / 2,
    }
  }

  dispose() {}
}