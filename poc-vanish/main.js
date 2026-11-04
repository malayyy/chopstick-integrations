import * as THREE from 'three'
import { CameraRig } from './scene/camera.js'
import { ChopstickPair } from './scene/chopsticks.js'
import { Atmosphere } from './scene/atmosphere.js'
import { LogoOverlay } from './scene/logo.js'
import { ScrollManager } from './scene/scroll.js'
import { beatLabel } from './scene/timeline.js'
import { makeEnvironment } from './scene/env.js'

function clamp01(x) { return Math.min(1, Math.max(0, x)) }

const stage = document.getElementById('poc-stage')
const canvas = document.createElement('canvas')
canvas.id = 'poc-canvas'
canvas.style.position = 'absolute'
canvas.style.inset = '0'
stage.appendChild(canvas)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(window.devicePixelRatio)

const envMap = makeEnvironment(renderer)
const scene = new THREE.Scene()
scene.environment = envMap
scene.background = new THREE.Color(0x030000)
const camera = new CameraRig()
const pair = new ChopstickPair({ tier: 'high', shardBudget: 28 })
const atmosphere = new Atmosphere('high')
const logo = new LogoOverlay()

// Scene lighting: ambient + directional key + crimson rim (critical for 3D visibility)
const amb = new THREE.AmbientLight(0xfff0e8, 0.55)
scene.add(amb)
const key = new THREE.DirectionalLight(0xfff5e6, 2.2)
key.position.set(-3, 4, 5)
key.castShadow = false
scene.add(key)
const rim = new THREE.PointLight(0xff3048, 3.0, 40)
rim.position.set(4, 1.5, 3)
scene.add(rim)
// Warm fill to balance crimson atmosphere
const fill = new THREE.DirectionalLight(0xffeedd, 0.6)
fill.position.set(2, -2, 4)
scene.add(fill)

scene.add(pair.group)
// Assign environment map to glass materials once env is baked
pair.matGlass && (pair.matGlass.envMap = envMap)
pair.matCrown && (pair.matCrown.envMap = envMap)
scene.add(atmosphere.group)
scene.add(logo.scene)
pair.group.renderOrder = 1

let portrait = window.innerWidth < window.innerHeight
let progress = 0
let time = 0

function onResize() {
  const w = window.innerWidth, h = window.innerHeight
  renderer.setSize(w, h)
  camera.resize(w, h)
  portrait = w < h
  logo.resize(portrait, w, h, window.devicePixelRatio, { x: 0, y: 0 })
}
onResize()

function tick() {
  time += 0.016
  pair.update(progress, time, portrait)
  camera.update(progress, time, portrait)
  atmosphere.update(time, progress)
  logo.update(progress, camera.pairScreen || { x: 0.5, y: 0.5 })
  renderer.render(scene, camera)
  console.log('[RENDER ' + Date.now() + '] tick progress=' + progress.toFixed(2) + ' canvas=' + (canvas.width || 'n/a'))
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
// After first render tick confirms visible output: reveal scene
setTimeout(() => {
  stage.classList.add('is-painted')
  console.log('[POSTER ' + Date.now() + '] .is-painted triggered after first tick verified')
}, 1000)

const scroll = new ScrollManager({
  onProgress: (p) => { if(window.hidePoster) window.hidePoster(p); 
    progress = clamp01(p)
    // DEBUG READOUT: shows scroll progress + active beat in real time
    const dbP = document.getElementById('db-p')
    const dbB = document.getElementById('db-b')
    const dbT = document.getElementById('db-t')
    const dbPt = document.getElementById('db-pt')
    if (dbP) dbP.textContent = progress.toFixed(2)
    if (dbB) dbB.textContent = beatLabel(progress)
    if (dbT) dbT.textContent = pair.tier
    if (dbPt) dbPt.textContent = portrait
  },
  onActiveChange: (active) => {
    pair.group.visible = active
    atmosphere.group.visible = active
    logo.update(progress, camera.pairScreen || { x: 0.5, y: 0.5 })
  },
})

scroll.start()

window.addEventListener('resize', onResize)

window.addEventListener('unload', () => {
  scroll.stop()
  pair.dispose?.()
  atmosphere.dispose?.()
  logo.dispose?.()
  renderer.dispose?.()
})
window.setPocProgress = function(v) { progress = Math.min(1, Math.max(0, parseFloat(v))); };
