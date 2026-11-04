import * as THREE from 'three'
import { phase, lerp, clamp01 } from './timeline.js'

/**
 * Supplied-logo handoff (exact asset, ref/logo.png).
 *
 * The plate renders in its own orthographic pass pinned to the screen, so
 * it stays crisp at every DPR — no perspective distortion. Alignment
 * constants come from tools/logo-scan.mjs:
 *   baked chopstick axis  -111.4° ≡ 68.6° (screen, y-down)
 *   baked sticks centroid (0.4090 W, 0.4417 H) of the plate
 * The 3D pair rotates to the same axis in the LOGO window (see
 * REST_LOGO in chopsticks.js); the plate then fades in centered on the
 * pair, so the baked sticks visually continue the 3D ones through bloom.
 */

export const LOGO_STICKS_CENTROID = { x: 0.4090, y: 0.4417 } // fraction of plate

const VERT = /* glsl */ `
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uGlow;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(t.rgb * (1.0 + uGlow), t.a * uOpacity);
  }`

export class LogoOverlay {
  constructor() {
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    this.tex = new THREE.TextureLoader().load(new URL('../ref/logo.png', import.meta.url).pathname)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uMap: { value: this.tex },
        uOpacity: { value: 0 },
        uGlow: { value: 0.35 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: FRAG,
    })
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.plane.renderOrder = 10
    this.scene.add(this.plane)
    this._w = 0
    this._h = 0
    this._dpr = 1
  }

  /**
   * Recompute the ortho frustum + plane size. The plate is:
   *   landscape: contain-fit at 84% of the smaller draw scale
   *   portrait: 86% of canvas width (production portrait lockup proportion)
   * with its sticks centroid pinned to the 3D pair's crossing point
   * (screen centre + small directional bias that mirrors the plate bias).
   */
  resize(portrait, w, h, dpr, pairBiasPx) {
    this._w = w; this._h = h
    this._dpr = dpr
    const cam = this.camera
    cam.left = -w / 2; cam.right = w / 2
    cam.top = h / 2; cam.bottom = -h / 2
    cam.updateProjectionMatrix()

    const plateW = portrait ? w * 0.86 : Math.min(w * 0.92, h * (1920 / 1080) * 0.84)
    const plateH = plateW * (1080 / 1920)
    this.plane.scale.set(plateW, plateH, 1)
    this._plateW = plateW
    this._plateH = plateH
    this.pairBiasPx = pairBiasPx || { x: 0, y: 0 }
  }

  update(p, pairScreen) {
    const e = phase(p, [0.87, 1.0])
    const u = this.material.uniforms
    u.uOpacity.value = clamp01(e * 1.2 - 0.05)
    u.uGlow.value = lerp(0.55, 0.25, e)
    if (e <= 0) return
    // pin: baked sticks centroid → the 3D pair's lockup crossing point
    const px = pairScreen.x - (LOGO_STICKS_CENTROID.x - 0.5) * this._plateW + this.pairBiasPx.x * (1 - e)
    const py = pairScreen.y - (LOGO_STICKS_CENTROID.y - 0.5) * this._plateH + this.pairBiasPx.y * (1 - e)
    this.plane.position.set(px, py, 0)
    const s = lerp(1.045, 1.0, e)
    this.plane.scale.set(this._plateW * s, this._plateH * s, 1)
  }

  dispose() {
    this.tex.dispose()
    this.material.dispose()
  }
}
