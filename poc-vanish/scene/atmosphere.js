import * as THREE from 'three'
import { mulberry32 } from './rand.js'
import { phase, local, clamp01, lerp, WINDOW } from './timeline.js'

/**
 * Crimson atmosphere: smoke billboards, petal debris, dust motes.
 * Everything is procedural and driven by (time, scroll p); the ambience
 * stays alive while idle but pauses with the document (handled upstream).
 */

function softSpriteTexture(size, falloff) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x / size - 0.5) * 2
      const dy = (y / size - 0.5) * 2
      const a = Math.pow(clamp01(1 - Math.sqrt(dx * dx + dy * dy)), falloff)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = a * 255
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Per-billboard seed lives in a uniform; two sine fields approximate curl.
const DRIFT_GLSL = /* glsl */ `
  vec3 drift(vec3 pos, float t, float seed, float amp) {
    vec2 q = vec2(
      sin(t * (0.9 + 0.4 * seed) + seed * 6.2831853) * 0.55
        + sin(t * 2.3 + seed * 9.9) * 0.25,
      cos(t * 1.15 + seed * 4.12) * 0.45
        + sin(t * 1.7 - seed * 7.7) * 0.3
    );
    return pos + vec3(q * amp, 0.0);
  }`

class SmokeField {
  constructor(count, spread) {
    this.group = new THREE.Group()
    this.tex = softSpriteTexture(128, 2.2)
    const plane = new THREE.PlaneGeometry(11, 11)
    const rng = mulberry32(4207)
    this.planes = []
    for (let i = 0; i < count; i++) {
      const seed = rng()
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uMap: { value: this.tex },
          uTime: { value: 0 },
          uSeed: { value: seed },
          uSwirl: { value: 0.4 },
          uOpacity: { value: 0.5 },
          uColor: { value: new THREE.Color().setHSL(0.985, 0.95, lerp(0.07, 0.19, seed)) },
          uColor2: { value: new THREE.Color().setHSL(0.965, 0.9, lerp(0.04, 0.11, seed)) },
        },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uSeed; uniform float uSwirl;
          varying vec2 vUv;
          ${DRIFT_GLSL}
          void main() {
            vUv = uv;
            float t = uTime * (0.05 + 0.04 * uSeed) * 8.0;
            vec3 p = drift(position, t, uSeed, uSwirl);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform vec3 uColor; uniform vec3 uColor2;
          uniform float uOpacity; uniform float uSeed;
          varying vec2 vUv;
          void main() {
            vec4 tex = texture2D(uMap, vUv);
            vec3 col = mix(uColor, uColor2, fract(uSeed * 7.31));
            gl_FragColor = vec4(col, tex.a * uOpacity);
          }`,
      })
      const m = new THREE.Mesh(plane, mat)
      m.position.set((rng() - 0.5) * spread[0], (rng() - 0.5) * spread[1], -2 - rng() * 7.5)
      m.rotation.z = rng() * Math.PI * 2
      const sc = lerp(0.8, 2.1, rng())
      m.scale.set(sc, sc, 1)
      m.renderOrder = -2
      this.planes.push(m)
      this.group.add(m)
    }
  }

  update(time, p) {
    const surge = phase(p, WINDOW.burst) * 1.6 + phase(p, [0.56, 0.72]) * 1.1
    for (const pl of this.planes) {
      const u = pl.material.uniforms
      u.uTime.value = time
      u.uSwirl.value = 0.35 + surge * 0.7
      // density envelope: baseline ambience, peak through the burst, calm tail
      u.uOpacity.value = clamp01(
        0.52 + phase(p, WINDOW.burst) * 0.26 + phase(p, [0.56, 0.74]) * 0.2
          - phase(p, WINDOW.rest) * 0.3 - phase(p, WINDOW.logo) * 0.36,
      ) * 0.8
    }
  }

  dispose() {
    for (const pl of this.planes) pl.material.dispose()
    this.tex.dispose()
  }
}

class PetalField {
  constructor(count) {
    this.count = count
    this.group = new THREE.Group()
    this.tex = softSpriteTexture(64, 1.15)
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMap: { value: this.tex },
        uTime: { value: 0 },
        uOpacity: { value: 0.85 },
        uColor: { value: new THREE.Color(0xff2548) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        ${DRIFT_GLSL}
        void main() {
          vec3 p = position;
          p.x += sin(uTime * (0.4) + float(gl_InstanceID) * 0.618) * 0.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          gl_FragColor = vec4(uColor * 1.1, tex.a * uOpacity);
        }`,
    })
    const geo = new THREE.PlaneGeometry(0.34, 0.22)
    this.imesh = new THREE.InstancedMesh(geo, this.material, count)
    this.imesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.imesh.frustumCulled = false
    const rng = mulberry32(77)
    this.d = []
    for (let i = 0; i < count; i++) {
      this.d.push({
        base: new THREE.Vector3((rng() - 0.5) * 17, rng() * 10 - 1, -1.2 - rng() * 6.5),
        seed: rng(),
        rate: lerp(0.9, 1.6, rng()),
        spin: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(2.4),
      })
    }
    this._e = new THREE.Euler()
    this._q = new THREE.Quaternion()
    this._v = new THREE.Vector3()
    this._one = new THREE.Vector3(1, 1, 1)
    this._m4 = new THREE.Matrix4()
    this.group.add(this.imesh)
  }

  update(time, p, energy) {
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uOpacity.value = clamp01(0.8 * (1 - phase(p, WINDOW.logo) * 0.6))
    for (let i = 0; i < this.count; i++) {
      const d = this.d[i]
      // looping ambient fall; energy (burst shockwave) only bends amplitude
      const loop = (time * d.rate + d.seed * 30) % 12
      this._v.set(
        d.base.x + Math.sin(time * (0.5 + d.seed) + d.seed * 6.28) * (0.4 + energy * 0.5),
        d.base.y - loop + 3,
        d.base.z + Math.cos(time * (0.4 + d.seed) ) * 0.35,
      )
      if (this._v.y < -7) this._v.y += 13.4 // continuous wrap
      this._e.set(time * d.spin.x + d.seed * 9, time * d.spin.y, time * d.spin.z)
      this._q.setFromEuler(this._e)
      this._m4.compose(this._v, this._q, this._one)
      this.imesh.setMatrixAt(i, this._m4)
    }
    this.imesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.material.dispose()
    this.tex.dispose()
    this.imesh.geometry.dispose()
  }
}

class Motes {
  constructor(count) {
    this.count = count
    const geo = new THREE.BufferGeometry()
    const rng = mulberry32(99)
    const pos = []
    for (let i = 0; i < count; i++) {
      pos.push((rng() - 0.5) * 18, (rng() - 0.5) * 14, -0.5 - rng() * 9)
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.5 },
        uSize: { value: 3.4 },
        uColor: { value: new THREE.Color(0xff6676) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uSize;
        varying float vTw;
        void main() {
          vec3 p = position;
          float t = uTime * 0.5 + float(gl_VertexID) * 0.618;
          p.x += sin(t) * 0.35;
          p.y += cos(t * 0.8) * 0.4;
          vTw = 0.5 + 0.5 * sin(t * 3.1);
          gl_PointSize = uSize * (0.7 + 0.6 * vTw);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity;
        varying float vTw;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.05, length(d)) * uOpacity * (0.4 + 0.6 * vTw);
          gl_FragColor = vec4(uColor, a);
        }`,
    })
    this.points = new THREE.Points(geo, this.material)
    this.points.frustumCulled = false
  }

  update(time, p) {
    this.material.uniforms.uTime.value = time
    this.material.uniforms.uOpacity.value = 0.42 * (1 - phase(p, WINDOW.logo) * 0.55)
  }

  dispose() {
    this.material.dispose()
    this.points.geometry.dispose()
  }
}

export class Atmosphere {
  constructor(tier) {
    const smokeCount = tier === 'high' ? 22 : tier === 'mid' ? 15 : 9
    const petalCount = tier === 'high' ? 42 : tier === 'mid' ? 26 : 16
    const moteCount = tier === 'high' ? 150 : tier === 'mid' ? 90 : 55
    this.smoke = new SmokeField(smokeCount, [18, 13])
    this.petals = new PetalField(petalCount)
    this.motes = new Motes(moteCount)
    this.group = new THREE.Group()
    this.group.add(this.smoke.group, this.petals.group, this.motes.group)
  }

  update(time, p) {
    const energy = phase(p, WINDOW.burst) * 0.7 + phase(p, [0.56, 0.74]) * 0.5
    this.smoke.update(time, p)
    this.petals.update(time, p, energy)
    this.motes.update(time, p)
  }

  dispose() {
    this.smoke.dispose()
    this.petals.dispose()
    this.motes.dispose()
  }
}
