import * as THREE from 'three'

/**
 * Procedural equirect environment (no HDRI asset): deep void below, crimson
 * haze above, one hot white key window on the left horizon (matches the
 * footage's hard left rim light) and two ruby corners for chopstick bloom.
 * Baked through PMREM for physically correct reflections/refraction feeding.
 */
export function makeEnvironment(renderer) {
  const W = 1024, H = 512
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')

  // vertical base: near-black floor -> deep crimson ceiling
  const grad = g.createLinearGradient(0, H, 0, 0)
  grad.addColorStop(0.0, '#020101')
  grad.addColorStop(0.32, '#0a0203')
  grad.addColorStop(0.62, '#200307')
  grad.addColorStop(0.85, '#3c050b')
  grad.addColorStop(1.0, '#4a060c')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  const blob = (x, y, r, inner, outer) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, inner)
    rg.addColorStop(1, outer)
    g.fillStyle = rg
    g.fillRect(x - r, y - r, 2 * r, 2 * r)
  }

  // hot key window on the left horizon (lights the glass outer faces)
  blob(0.16 * W, 0.52 * H, 0.16 * W, 'rgba(255,236,228,1.0)', 'rgba(255,236,228,0)')
  blob(0.16 * W, 0.52 * H, 0.34 * W, 'rgba(255,120,110,0.55)', 'rgba(255,60,70,0)')

  // ruby counter-glow upper-left + faint right accent
  blob(0.06 * W, 0.30 * H, 0.22 * W, 'rgba(255,30,48,0.5)', 'rgba(180,10,26,0)')
  blob(0.88 * W, 0.34 * H, 0.26 * W, 'rgba(200,20,44,0.3)', 'rgba(120,6,18,0)')
  // cold spark high center for chopstick glints
  blob(0.56 * W, 0.12 * H, 0.08 * W, 'rgba(255,250,246,0.5)', 'rgba(255,240,240,0)')

  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envRT = pmrem.fromEquirectangular(tex)
  tex.dispose()
  pmrem.dispose()
  return envRT.texture
}
