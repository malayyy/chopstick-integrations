import * as THREE from 'three'
import { CameraRig } from './camera.js'
import { ChopstickPair } from './chopsticks.js'
import { Atmosphere } from './atmosphere.js'
import { LogoOverlay } from './logo.js'
import { ScrollManager } from './scroll.js'

/**
 * Main scene orchestration — the PoC's single source of truth.
 * All assets are loaded in sequence; the pair updates on scroll, the camera
 * tracks the pair's crossing point, and the logo overlay pins to the baked
 * sticks centroid.
 */
export class Scene {
  constructor() {
    this.scene = new THREE.Scene()
    this.camera = new CameraRig()
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    document.body.appendChild(this.renderer.domElement)

    this.pair = new ChopstickPair({ tier: 'high', env: null, shardBudget: 28 })
    this.atmosphere = new Atmosphere('high')
    this.logo = new LogoOverlay()
    this.scroll = new ScrollManager({
      onProgress: (p) => {
        this.pair.update(p, time, this._portrait)
        this.camera.update(p, time, this._portrait)
        this.logo.update(p, this.pair.crossingPoint)
      },
      onActiveChange: (active) => {
        this.atmosphere.group.visible = active
        this.pair.ornateRoot.visible = active
        this.logo.group.visible = active
      },
    })
    this._portrait = window.innerWidth < window.innerHeight
    this._resize(window.innerWidth, window.innerHeight)

    // --- initialization ----------------------------------------------------
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this._onResize()
    this._onScroll()
    this.scroll.start()

    // --- animate -----------------------------------------------------------
    this._time = 0
    this._animate()
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight
    this.renderer.setSize(w, h)
    this.camera.resize(w, h)
    this.scroll.resize(w, h)
  }

  _onScroll() {
    window.addEventListener('scroll', () => this.scroll._computeProgress())
  }

  _animate() {
    requestAnimationFrame(() => {
      const time = performance.now() * 0.001
      this._time = time

      this.pair.update(this._progress, time, this._portrait)
      this.atmosphere.update(time, this._progress)
      this.camera.update(this._progress, time, this._portrait)

      this.renderer.render(this.scene, this.camera)
      requestAnimationFrame(() => this._animate())
    })
  }

  dispose() {
    this.scroll.stop()
    this.atmosphere.dispose()
    this.renderer.dispose()
  }
}