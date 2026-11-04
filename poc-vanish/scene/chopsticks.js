import * as THREE from 'three'
import { mulberry32 } from './rand.js'
import { WINDOW, phase, local, clamp01, smoothstep, lerp } from './timeline.js'

/**
 * Fully procedural ruby-glass chopsticks + the pre-fractured shard system.
 *
 * - Ornate pair (beats 0–0.42): lathe shafts with carved band rings and a
 *   carved handle head with bead + petal crown at the THICK end — exactly
 *   like the decorated heads rising out of the grip in reference f_060.
 * - Shard set: each shaft is pre-cut into jittered length × angle wedges
 *   whose ASSEMBLED pose is the ornate silhouette, so the intact-shafts →
 *   shards swap at the burst moment is visually seamless (masked further by
 *   a designed light flash at .44).
 * - Reassembly: wedges converge onto the sleek rest pose (f_240), then
 *   rotate into the logo's baked chopstick axis (f_300).
 *
 * Every pose is a pure function of scroll p — scrub direction and speed
 * cannot desync the scene.
 */

export const STICK_LENGTH = 8.8

/** Radius profile r(u), u = 0 at the butt (handle), 1 at the tip. */
export function shaftRadius(u) {
  const barrel = 1.14 + 0.16 * Math.exp(-Math.pow((u - 0.16) / 0.20, 2))
  return Math.max(0.028, 0.185 * barrel * Math.max(0.34, 1 - 0.62 * u))
}

function shaftGeometry(segments = 72, radial = 22) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const u = i / segments
    pts.push(new THREE.Vector2(Math.max(0.001, shaftRadius(u)), u * STICK_LENGTH))
  }
  const g = new THREE.LatheGeometry(pts, radial)
  g.computeVertexNormals()
  return g
}

/** One carved band ring at height u (shared geometry per ring). */
function ringGeometry(u) {
  const r = shaftRadius(u) + 0.012
  const g = new THREE.TorusGeometry(r, 0.016, 8, 36)
  g.rotateX(Math.PI / 2)
  g.translate(0, u * STICK_LENGTH, 0)
  return g
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Physically based ruby glass (desktop tier). */
export function makeGlassPhysical() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x58010a,
    metalness: 0.02,
    roughness: 0.07,
    transmission: 1.0,
    thickness: 1.5,
    ior: 1.68,
    attenuationColor: new THREE.Color(0xa2001a),
    attenuationDistance: 1.7,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    iridescence: 0.3,
    iridescenceIOR: 1.3,
    envMapIntensity: 1.5,
    emissive: 0x330005,
    emissiveIntensity: 0.45,
  })
}

/** Additive fresnel glass (mobile tier) — no transmission render target. */
export function makeGlassFake() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uDeep: { value: new THREE.Color(0x8c0413) },
      uHot: { value: new THREE.Color(0xff9aa4) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW; varying vec3 vViewW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(wp.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep; uniform vec3 uHot;
      varying vec3 vNormalW; varying vec3 vViewW;
      void main() {
        float f = pow(clamp(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 0.0, 1.0), 2.4);
        vec3 col = mix(uDeep, uHot, f);
        gl_FragColor = vec4(col * (0.30 + 1.2 * f), 1.0);
      }`,
  })
}

/** Solid ornamental ruby for crowns/rings (cheap, no transmission). */
export function makeCrownMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x7c0310,
    metalness: 0.2,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.25,
    emissive: 0x52000c,
    emissiveIntensity: 0.6,
    transparent: true,
  })
}

// ---------------------------------------------------------------------------
// Pose constants
// ---------------------------------------------------------------------------

// rotZ is tuned so:
//   ORNATE        tips rise to the upper right (arm-side, echo f_001–f_060)
//   REST_SHALLOW  sleek pair diagonal like f_240
//   REST_LOGO     baked-logo chopstick axis: measured 68.6° screen angle,
//                 line-symmetric pick: +21.4° world crossing the O.
const ORNATE = { rotX: -0.08, rotZ: -0.40, center: new THREE.Vector3(-0.5, -0.75, 0) }
const REST_SHALLOW = { rotX: 0.05, rotZ: -0.87, center: new THREE.Vector3(0, 0, 0) }
const REST_LOGO = { rotX: 0.10, rotZ: 0.374, center: new THREE.Vector3(0.05, 0.10, 0) }

function stickWorld({ rotX, rotZ, center }, stickIndex) {
  const m = new THREE.Matrix4()
  m.makeRotationFromEuler(new THREE.Euler(rotX, 0, rotZ))
  const localOff = (stickIndex === 0 ? -1 : 1) * 0.20
  const mLocal = new THREE.Matrix4().makeTranslation(localOff, stickIndex === 1 ? -0.1 : 0.1, 0)
  m.multiply(mLocal)
  const mWorld = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
  mWorld.multiply(m)
  return mWorld
}

/**
 * The pair root exposed to the scene.
 */
export class ChopstickPair {
  /**
   * @param {object} cfg
   * @param {'high'|'mid'|'low'} cfg.tier
   * @param {number} cfg.shardBudget shards per stick (28 desktop, 18 mobile)
   * @param {number} cfg.seed seed for deterministic geometry
   */
  constructor({ tier, shardBudget = 28, seed = 20261104 }) {
    this.tier = tier
    this.group = new THREE.Group()
    this.ornateRoot = new THREE.Group()
    this.shardRoot = new THREE.Group()
    this.group.add(this.ornateRoot, this.shardRoot)

    this.matGlass = tier === 'high' ? makeGlassPhysical() : makeGlassFake()
    this.matCrown = makeCrownMaterial()

    this._buildOrnate(seed)
    this._buildShards(shardBudget)
    this._precomputePoses()

    this._qs = {
      qA: new THREE.Quaternion(),
      qB: new THREE.Quaternion(),
      qT: new THREE.Quaternion(),
      mid: new THREE.Vector3(),
      ab: new THREE.Vector3(),
      br: new THREE.Vector3(),
    }
  }

  _buildOrnate(seed) {
    const shaftGeo = shaftGeometry()
    const ringGeoA = ringGeometry(0.22)
    const ringGeoB = ringGeometry(0.34)
    const ringGeoC = ringGeometry(0.44)
    const rng = mulberry32(seed + 7)
    for (let i = 0; i < 2; i++) {
      const stick = new THREE.Group()
      stick.matrixAutoUpdate = false
      stick.add(new THREE.Mesh(shaftGeo, this.matGlass))
      stick.add(new THREE.Mesh(ringGeoA, this.matCrown))
      stick.add(new THREE.Mesh(ringGeoB, this.matCrown))
      stick.add(new THREE.Mesh(ringGeoC, this.matCrown))
      // carved handle head at the THICK end: bead + petal crown
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.10, 18, 14), this.matCrown)
      bead.position.y = STICK_LENGTH * 0.155
      stick.add(bead)
      const petalGeo = new THREE.ConeGeometry(0.042, 0.34, 6)
      petalGeo.translate(0, 0.17, 0)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + rng() * 0.45
        const petal = new THREE.Mesh(petalGeo, this.matCrown)
        petal.position.set(Math.cos(a) * 0.075, STICK_LENGTH * 0.155, Math.sin(a) * 0.075)
        petal.rotation.set(0, a, -1.15 - rng() * 0.4)
        stick.add(petal)
      }
      this.ornateRoot.add(stick)
    }
    const w = [stickWorld(ORNATE, 0), stickWorld(ORNATE, 1)]
    this.ornateRoot.children[0].matrix.copy(w[0])
    this.ornateRoot.children[1].matrix.copy(w[1])
    this._ornateWorld = w
  }

  _buildShards(perStick) {
    const rng = mulberry32(9031)
    const nSeg = perStick >= 24 ? 7 : 6
    const nAng = perStick >= 24 ? 4 : 3
    const petalCone = new THREE.ConeGeometry(0.05, 0.34, 6)
    petalCone.translate(0, 0.17, 0)
    for (let s = 0; s < 2; s++) {
      const uc = [0]
      for (let i = 1; i < nSeg; i++) uc.push((i / nSeg) * (1 - (rng() - 0.5) * 0.04))
      uc.push(1)
      const ac = []
      for (let k = 0; k < nAng; k++) ac.push((k / nAng) * Math.PI * 2 + rng() * 0.3 - 0.15)
      for (let i = 0; i < nSeg; i++) {
        for (let k = 0; k < nAng; k++) {
          const a0 = ac[k]
          const a1 = k + 1 < nAng ? ac[k + 1] : Math.PI * 2 + ac[0]
          const geo = this._shardGeometry(uc[i], uc[i + 1], a0, a1, rng)
          const mesh = new THREE.Mesh(geo, this.matGlass)
          mesh.visible = false
          mesh.userData = this._shardMeta(s, rng, false, (uc[i] + uc[i + 1]) / 2)
          this.shardRoot.add(mesh)
        }
      }
      // crown shards: the ornament breaks loose and dissolves away
      for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(petalCone, this.matCrown)
        mesh.visible = false
        mesh.userData = this._shardMeta(s, rng, true, 0.155)
        this.shardRoot.add(mesh)
      }
    }
  }

  _shardGeometry(u0, u1, a0, a1, rng) {
    const n = 6
    const pos = []
    const y0 = u0 * STICK_LENGTH
    const y1 = u1 * STICK_LENGTH
    const pushArc = (y, u, jt) => {
      const r = shaftRadius(u)
      for (let j = 0; j <= n; j++) {
        const a = lerp(a0 + jt, a1 + jt, j / n)
        pos.push(Math.cos(a) * r * (0.85 + 0.3 * rng()), y, Math.sin(a) * r * (0.85 + 0.3 * rng()))
      }
    }
    pushArc(y0, u0, 0)
    pushArc(y1, u1, (rng() - 0.5) * 0.5)
    pos.push(0, y0, 0)
    pos.push(0, y1, 0)
    const idx = []
    const A = n + 1
    for (let j = 0; j < n; j++) idx.push(j, A + j, j + 1, j + 1, A + j, A + j + 1)
    for (let j = 0; j < n; j++) idx.push(2 * A, j + 1, j)
    for (let j = 0; j < n; j++) idx.push(2 * A + 1, A + j, A + j + 1)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }

  _shardMeta(stickIndex, rng, isCrown, uMid) {
    return {
      stickIndex,
      isCrown,
      wLocal: new THREE.Vector3(
        isCrown ? 0 : (rng() - 0.5) * 0.10,
        clamp01(isCrown ? 0.155 : uMid + (rng() - 0.5) * 0.05) * STICK_LENGTH,
        isCrown ? 0 : (rng() - 0.5) * 0.10,
      ),
      burstDir: new THREE.Vector3(rng() - 0.5, 0.2 + rng() * 0.8, rng() - 0.5).normalize(),
      dist: lerp(isCrown ? 3.4 : 1.7, isCrown ? 6 : 4.6, rng()),
      ctrl: (rng() - 0.5) * 2.8,
      tumbleAxis: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
      tumbleSpeed: lerp(1.0, 2.6, rng()),
      tumblePhase: rng() * Math.PI * 2,
      stagger: rng(),
      restScale: isCrown ? 1.0 : lerp(0.85, 0.97, rng()),
    }
  }

  _precomputePoses() {
    const shallowW = [stickWorld(REST_SHALLOW, 0), stickWorld(REST_SHALLOW, 1)]
    const logoW = [stickWorld(REST_LOGO, 0), stickWorld(REST_LOGO, 1)]
    const v = new THREE.Vector3()
    const q = new THREE.Quaternion()
    this.shards = []
    for (const mesh of this.shardRoot.children) {
      const d = mesh.userData
      const s = d.stickIndex
      const rec = { mesh, d }
      v.copy(d.wLocal).applyMatrix4(this._ornateWorld[s])
      rec.startP = v.clone()
      rec.startQ = q.setFromRotationMatrix(this._ornateWorld[s]).clone()

      const wl = d.wLocal.clone().multiplyScalar(d.restScale)
      v.copy(wl).applyMatrix4(shallowW[s])
      rec.shallowP = v.clone()
      rec.shallowQ = new THREE.Quaternion().setFromRotationMatrix(shallowW[s]).clone()

      v.copy(wl).applyMatrix4(logoW[s])
      rec.logoP = v.clone()
      rec.logoQ = new THREE.Quaternion().setFromRotationMatrix(logoW[s]).clone()

      if (d.isCrown) {
        rec.crownP = rec.startP.clone().addScaledVector(d.burstDir, d.dist * 2.2)
      }
      this.shards.push(rec)
    }
    this._shallowQ = new THREE.Quaternion().setFromRotationMatrix(shallowW[0])
    this._logoQ = new THREE.Quaternion().setFromRotationMatrix(logoW[0])
  }

  /**
   * Pose evaluation — pure in (p, time).
   */
  update(p, time, portrait) {
    const eLogo = phase(p, WINDOW.logo)
    const eBurst = phase(p, WINDOW.burst)
    const eRest = phase(p, WINDOW.rest)

    this.ornateRoot.visible = p <= WINDOW.burst[0] - 0.004
    this.shardRoot.visible = p > WINDOW.burst[0] - 0.006
    this.matCrown.opacity = clamp01(1 - smoothstep(local(p, [0.70, 0.9])))

    const { qA, qB, qT, mid, ab, br } = this._qs
    const hoverScale = this.tier === 'low' ? 0 : 1

    for (const s of this.shards) {
      const { mesh, d } = s
      if (!mesh.visible) continue

      const b = smoothstep(clamp01((eBurst - (d.stagger * 0.5 + 0.5) * 0.10) / 0.90))
      const r = smoothstep(clamp01((eRest - (d.stagger * 0.5 + 0.5) * 0.16) / 0.84))

      if (d.isCrown) {
        const sw = b * (1 - eRest * 0.9)
        mid.copy(s.startP).addScaledVector(d.burstDir, s.crownP.distanceTo(s.startP) * sw)
        mid.y -= 0.6 * eRest * (0.5 + (d.stagger % 0.3))
        qT.setFromAxisAngle(d.tumbleAxis, d.tumblePhase + d.tumbleSpeed * 3 * sw)
        mesh.position.copy(mid)
        mesh.quaternion.copy(qT)
        const fade = clamp01(1 - smoothstep(local(p, [0.70, 0.92])))
        mesh.scale.setScalar(Math.max(0.001, fade * d.restScale))
        continue
      }

      // mid-flight apex per shard (perpendicular shear away from the axis)
      mid.copy(s.startP).addScaledVector(d.burstDir, d.dist).addScaledVector(
        new THREE.Vector3(1, 0, 0.3).normalize(),
        d.ctrl * 0.35,
      )

      // outward leg (A → apex)
      ab.copy(s.startP).lerp(mid, smoothstep(b))
      // return leg (apex → end). end blends shallow→logo pose.
      const endP = s.shallowP.clone().lerp(s.logoP, eLogo)
      br.copy(mid).lerp(endP, smoothstep(r))

      mesh.position.copy(r > 0 ? br : ab)

      // rotation
      const tumble = Math.sin(clamp01(b) * Math.PI) * (1 - r)
      qT.setFromAxisAngle(
        d.tumbleAxis,
        d.tumblePhase + d.tumbleSpeed * (1 + d.stagger) * 2.4 * tumble,
      )
      qA.copy(s.startQ).multiply(qT)
      if (r > 0) {
        const endQ = s.shallowQ.clone().slerp(s.logoQ, eLogo)
        qA.slerp(endQ, Math.min(1, r))
      }
      mesh.quaternion.copy(qA)

      // snap overshoot near the end of the return leg
      const over = r > 0.85 ? 1 + 0.07 * Math.sin(clamp01((r - 0.85) / 0.15) * Math.PI) : 1
      const hover = 1 + hoverScale * 0.012 * Math.sin(time * 0.9 + d.stagger * 6.28)
      const aliveHover = p < WINDOW.burst[0] ? hover : 1
      mesh.scale.setScalar(d.restScale * over * aliveHover)
    }
  }

  dispose() {}
}

function sEase(x) {
  return smoothstep(x)
}
