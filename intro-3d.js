import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const canvas = document.getElementById('stage');
const layer = document.getElementById('cinematic-layer');
const track = document.getElementById('track');
const boot = document.getElementById('boot');
const percent = document.getElementById('boot-percent');
const home = document.getElementById('home');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 700px)').matches;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#050305');
scene.fog = new THREE.FogExp2('#080308', 0.035);

const camera = new THREE.PerspectiveCamera(mobile ? 43 : 36, innerWidth / innerHeight, 0.1, 80);
camera.position.set(0, 0.05, 8.7);
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: !mobile, alpha: false, powerPreference: 'high-performance',
  stencil: false, depth: true
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.35 : 1.8));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = !mobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

scene.add(new THREE.HemisphereLight(0xf3dce3, 0x180812, 1.2));
const key = new THREE.DirectionalLight(0xffe5dc, 3.4);
key.position.set(-3.5, 5, 6);
key.castShadow = !mobile;
scene.add(key);
const rim = new THREE.PointLight(0xe31b43, 115, 13, 2);
rim.position.set(2.8, 1.5, -1.5);
scene.add(rim);
const edge = new THREE.PointLight(0x9dc9ff, 55, 10, 2);
edge.position.set(-3, -1, 2);
scene.add(edge);
const floorGlow = new THREE.PointLight(0x8c0b27, 24, 9, 2);
floorGlow.position.set(0, -3.2, 1);
scene.add(floorGlow);

const stage = new THREE.Group();
scene.add(stage);
const world = new THREE.Group();
stage.add(world);

const skin = new THREE.MeshPhysicalMaterial({
  color: 0xc58e79, roughness: 0.48, metalness: 0, sheen: 0.34,
  sheenColor: new THREE.Color('#efb9a7'), sheenRoughness: 0.58,
  clearcoat: 0.08, clearcoatRoughness: 0.55
});
const skinLight = new THREE.MeshPhysicalMaterial({
  color: 0xd6a18d, roughness: 0.43, sheen: 0.38,
  sheenColor: new THREE.Color('#ffd2c1')
});
const nailMat = new THREE.MeshPhysicalMaterial({
  color: 0xe5b5a8, roughness: 0.28, clearcoat: 0.45, clearcoatRoughness: 0.24
});
const darkSkin = new THREE.MeshStandardMaterial({ color: 0x986c5e, roughness: 0.62 });
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xe8f5ff, metalness: 0.02, roughness: 0.055, transmission: 0.88,
  thickness: 0.24, ior: 1.48, transparent: true, opacity: 0.94,
  clearcoat: 1, clearcoatRoughness: 0.035, attenuationColor: new THREE.Color('#a8d9ff'),
  attenuationDistance: 1.8
});
const glassCore = new THREE.MeshStandardMaterial({
  color: 0xe5f5ff, metalness: 0.45, roughness: 0.16, emissive: 0x2d526f, emissiveIntensity: 0.22
});
const shardMat = new THREE.MeshPhysicalMaterial({
  color: 0xdceeff, metalness: 0.12, roughness: 0.09, transmission: 0.56,
  thickness: 0.14, ior: 1.5, transparent: true, opacity: 0.9,
  clearcoat: 1, emissive: 0x17314a, emissiveIntensity: 0.18
});

function sphere(parent, name, pos, scale, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material);
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function capsule(parent, name, length, radius, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 5, 12), material);
  mesh.name = name;
  mesh.rotation.z = -Math.PI / 2;
  mesh.position.x = length / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function makeFinger(parent, name, origin, lengths, curl) {
  const root = new THREE.Group();
  root.name = name + '-root';
  root.position.set(...origin);
  parent.add(root);
  const joints = [];
  let node = root;
  lengths.forEach((len, index) => {
    const joint = new THREE.Group();
    joint.name = name + '-joint-' + index;
    node.add(joint);
    capsule(joint, name + '-segment-' + index, len, index === 0 ? 0.105 : 0.088, index === 0 ? skinLight : skin);
    sphere(joint, name + '-knuckle-' + index, [len, 0, 0], [0.092, 0.09, 0.09], skin);
    if (index === lengths.length - 1) {
      sphere(joint, name + '-nail-' + index, [len - 0.065, 0.006, 0.078], [0.13, 0.052, 0.025], nailMat);
    }
    joints.push(joint);
    node = joint;
    node.position.x = index === 0 ? 0 : lengths[index - 1];
  });
  root.userData.joints = joints;
  root.userData.curl = curl;
  return root;
}

// A sculpted palm, wrist and articulated fingers. The final art pass swaps
// this blockout for the detailed CC0/commissioned skin-weighted hand asset.
const hand = new THREE.Group();
hand.position.set(-6.2, -0.1, 0.25);
world.add(hand);
const palm = sphere(hand, 'palm', [-0.12, 0, 0], [0.72, 0.53, 0.245], skin);
palm.rotation.z = -0.08;
sphere(hand, 'thenar-pad', [0.28, -0.23, 0.06], [0.38, 0.3, 0.2], skinLight);
const wrist = sphere(hand, 'wrist', [-0.78, 0, 0], [0.46, 0.34, 0.22], skin);
wrist.rotation.z = -0.05;
const fingers = [
  makeFinger(hand, 'index', [0.27, 0.31, 0.01], [0.36, 0.29, 0.23], 0.9),
  makeFinger(hand, 'middle', [0.34, 0.105, 0.015], [0.4, 0.32, 0.25], 0.82),
  makeFinger(hand, 'ring', [0.31, -0.12, 0.01], [0.37, 0.29, 0.22], 0.74),
  makeFinger(hand, 'little', [0.18, -0.31, 0.005], [0.29, 0.23, 0.18], 0.66)
];
const thumb = new THREE.Group();
thumb.name = 'thumb-root';
thumb.position.set(0.26, -0.25, 0.12);
thumb.rotation.z = -0.8;
hand.add(thumb);
const thumbJoints = [];
let thumbNode = thumb;
[0.32, 0.27, 0.2].forEach((len, i) => {
  const joint = new THREE.Group();
  thumbNode.add(joint);
  capsule(joint, 'thumb-segment-' + i, len, i === 0 ? 0.13 : 0.105, skinLight);
  sphere(joint, 'thumb-joint-' + i, [len, 0, 0], [0.12, 0.115, 0.105], skin);
  if (i === 2) sphere(joint, 'thumb-nail', [len - 0.055, 0, 0.09], [0.12, 0.052, 0.025], nailMat);
  thumbJoints.push(joint);
  joint.position.x = i ? [0.32, 0.27][i - 1] : 0;
  thumbNode = joint;
});
hand.userData.thumbJoints = thumbJoints;

// Tendon ridges and soft knuckle pads add volume cues under the key light.
for (let i = 0; i < 4; i++) {
  sphere(hand, 'metacarpal-' + i, [0.16 + i * 0.045, 0.27 - i * 0.18, 0.13], [0.28, 0.105, 0.09], skin);
}

// The chopsticks are independent physical glass objects with inner optical cores.
function makeRod(name, start, end) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const group = new THREE.Group();
  group.name = name;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.065, length, 20, 1, false), glass);
  rod.position.copy(a).add(b).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  rod.castShadow = true;
  group.add(rod);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, length * 0.94, 8), glassCore);
  core.position.copy(rod.position);
  core.quaternion.copy(rod.quaternion);
  group.add(core);
  world.add(group);
  group.userData.rod = rod;
  group.userData.core = core;
  return group;
}
const stickA = makeRod('glass-chopstick-a', [0.45, 0.23, 0.15], [3.4, 1.0, -0.15]);
const stickB = makeRod('glass-chopstick-b', [0.45, 0.02, 0.12], [3.4, -0.12, -0.22]);

const shards = new THREE.Group();
world.add(shards);
const shardMeshes = [];
for (let i = 0; i < 34; i++) {
  const geometry = new THREE.TetrahedronGeometry(0.11 + Math.random() * 0.18, 0);
  const mesh = new THREE.Mesh(geometry, shardMat);
  mesh.visible = false;
  mesh.castShadow = true;
  shards.add(mesh);
  shardMeshes.push({
    mesh,
    origin: new THREE.Vector3(1.85 + (Math.random() - 0.5) * 1.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.8),
    velocity: new THREE.Vector3((Math.random() - 0.5) * 2.8, (Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 1.8),
    spin: new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5),
    scale: 0.55 + Math.random() * 1.3
  });
}
const dust = new THREE.Group();
world.add(dust);
for (let i = 0; i < (mobile ? 55 : 110); i++) {
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.012 + Math.random() * 0.022, 7, 6),
    new THREE.MeshBasicMaterial({ color: i % 4 ? 0xc5d9ec : 0xd51b40, transparent: true, opacity: 0.6 }));
  p.position.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5.5, (Math.random() - 0.5) * 3);
  dust.add(p);
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({
  color: 0x080509, roughness: 0.28, metalness: 0.16
}));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -2.1, -1.5);
floor.receiveShadow = true;
scene.add(floor);

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = THREE.MathUtils.lerp;
const distance = () => Math.max(2200, Math.min(4200, innerHeight * (mobile ? 2.6 : 3.1)));
let maxScroll = 1;
let target = 0;
let progress = 0;
let lastTime = performance.now();
let completed = false;
let bootDismissed = false;
let raf = 0;
let resizeObserver;

function sizeTrack() {
  track.style.height = `${innerHeight + distance()}px`;
  maxScroll = Math.max(1, track.offsetHeight - innerHeight);
}
function pose(p, dt) {
  const enter = smooth(0.015, 0.22, p);
  const grip = smooth(0.22, 0.42, p);
  const breakMix = smooth(0.53, 0.67, p);
  const rejoin = smooth(0.76, 0.91, p);
  hand.position.x = mix(-6.2, -0.55, enter);
  hand.position.y = mix(-0.25, -0.05, enter) + Math.sin(p * Math.PI * 8) * 0.018;
  hand.rotation.z = mix(0.1, -0.08, enter) + Math.sin(p * Math.PI * 3) * 0.018;
  fingers.forEach((finger, i) => {
    const curl = finger.userData.curl * grip;
    finger.userData.joints.forEach((joint, j) => {
      joint.rotation.z = mix(0.02, -curl * (j === 0 ? 0.46 : j === 1 ? 0.78 : 0.62), 1);
    });
  });
  thumbJoints.forEach((joint, i) => {
    joint.rotation.z = mix(0, 0.12 + grip * (i === 0 ? 0.7 : 0.9), 1);
  });
  const tremor = smooth(0.43, 0.53, p) * (1 - smooth(0.66, 0.72, p));
  hand.position.y += Math.sin(performance.now() * 0.055) * 0.035 * tremor;
  hand.rotation.z += Math.sin(performance.now() * 0.07) * 0.012 * tremor;

  [stickA, stickB].forEach((stick, i) => {
    const split = smooth(0.56, 0.7, p) * (1 - smooth(0.78, 0.91, p));
    const rod = stick.userData.rod;
    const core = stick.userData.core;
    stick.position.x = mix(5.5, 0, enter) + mix(0, 0.12, split) * (i ? -1 : 1);
    stick.rotation.z = (i ? -1 : 1) * (0.035 + 0.07 * tremor + split * 0.14);
    rod.scale.y = 1 - split * 0.06;
    core.visible = p < 0.55 || p > 0.91;
    stick.visible = p < 0.98;
  });

  const burst = smooth(0.56, 0.65, p);
  const settle = smooth(0.78, 0.91, p);
  shardMeshes.forEach((item, i) => {
    const { mesh, origin, velocity, spin, scale } = item;
    const active = burst * (1 - settle);
    mesh.visible = active > 0.01;
    if (!mesh.visible) return;
    const t = burst * 0.9;
    mesh.position.copy(origin).addScaledVector(velocity, t);
    mesh.position.y -= t * t * 0.75;
    mesh.rotation.set(spin.x * t, spin.y * t, spin.z * t);
    const s = scale * Math.sin(Math.PI * clamp(active));
    mesh.scale.setScalar(Math.max(0.001, s));
    mesh.material = shardMat;
  });
  shards.visible = burst > 0.01 && settle < 0.99;

  const reveal = smooth(0.88, 1, p);
  camera.position.x = mix(0.15, 0, reveal) + Math.sin(p * Math.PI * 2) * 0.045;
  camera.position.y = mix(0.08, 0.02, reveal);
  camera.position.z = mix(8.7, 7.2, smooth(0.45, 0.68, p)) + reveal * 0.5;
  camera.lookAt(mix(0.05, 0.25, smooth(0.45, 0.7, p)), 0.0, 0);
  stage.rotation.y = Math.sin(p * Math.PI) * 0.045;
  stage.rotation.x = Math.sin(p * Math.PI * 2) * 0.012;
  rim.intensity = 90 + tremor * 65 + breakMix * 38;
  floorGlow.intensity = 22 + breakMix * 28;
}

function revealHome() {
  if (completed) return;
  completed = true;
  layer.classList.add('curtain-open');
  setTimeout(() => {
    layer.hidden = true;
    track.hidden = true;
    home.classList.add('active');
    home.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.remove('cinematic-active');
    document.body.classList.remove('cinematic-active');
    if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
    scrollTo(0, 0);
  }, 1050);
}
function dismissBoot() {
  if (bootDismissed || !boot.classList.contains('ready')) return;
  bootDismissed = true;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 800);
}
function replay() {
  if (!completed) return;
  completed = false;
  bootDismissed = true;
  layer.hidden = false;
  layer.classList.remove('curtain-open');
  track.hidden = false;
  home.classList.remove('active');
  home.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.add('cinematic-active');
  document.body.classList.add('cinematic-active');
  scrollTo(0, 0);
  target = progress = 0;
}
window.replayCinematic = replay;
addEventListener('wheel', event => {
  if (completed && scrollY <= 2 && event.deltaY < -4) {
    event.preventDefault();
    replay();
  }
}, { passive: false });
const replayLink = document.getElementById('replay-intro');
if (replayLink) replayLink.addEventListener('click', event => { event.preventDefault(); replay(); });
addEventListener('scroll', () => {
  if (!completed && scrollY > 4) dismissBoot();
  target = clamp(scrollY / maxScroll);
}, { passive: true });

function render(now) {
  raf = requestAnimationFrame(render);
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
  lastTime = now;
  target = clamp(scrollY / maxScroll);
  progress += (target - progress) * (1 - Math.exp(-8.5 * dt));
  if (Math.abs(target - progress) < 0.0006) progress = target;
  pose(progress, dt);
  renderer.render(scene, camera);
  if (!completed && progress >= 0.997) revealHome();
}
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = mobile ? 43 : 36;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.35 : 1.8));
  renderer.setSize(innerWidth, innerHeight, false);
  sizeTrack();
  target = clamp(scrollY / maxScroll);
}
sizeTrack();
addEventListener('resize', resize, { passive: true });
if (window.visualViewport) visualViewport.addEventListener('resize', resize, { passive: true });
renderer.setAnimationLoop(null);
pose(0, 0);
renderer.render(scene, camera);
percent.textContent = '100%';
boot.classList.add('ready');
boot.setAttribute('aria-label', 'Chopstick 3D experience ready. Scroll to begin.');
raf = requestAnimationFrame(render);

if (reducedMotion) {
  // Reduced-motion users can skip the cinematic without being trapped.
  boot.classList.add('ready');
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.textContent = 'Enter website';
  skip.style.cssText = 'margin-top:20px;padding:12px 22px;border:1px solid #b51b39;border-radius:999px;background:#b51b39;color:white;cursor:pointer';
  document.getElementById('boot-content')?.append(skip);
  skip.addEventListener('click', revealHome);
}

window.__chopstick3D = {
  seek(value) { target = clamp(value); scrollTo(0, target * maxScroll); },
  snapshot() { return { progress, target, objects: scene.children.length, renderer: renderer.info.render, completed }; }
};
