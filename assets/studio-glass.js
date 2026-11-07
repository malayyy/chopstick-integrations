/* Chopstick studio — interactive glass-orb field.
   Plain HTML project; Three.js is loaded as a browser ES module from jsDelivr.
   The orb interiors use original procedural motion graphics (not stock/client footage). */
(() => {
  "use strict";

  const stage = document.querySelector("#studio .studio__glass-stage");
  if (!stage) return;

  const canvas = stage.querySelector(".studio__glass-canvas");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const mobile = coarsePointer || window.innerWidth < 700;
  let renderer, scene, camera, orbs = [], raf = 0, active = false;
  let width = 1, height = 1, viewWidth = 11, viewHeight = 11;
  let elapsed = 0, lastTime = 0, pointerInside = false;
  const pointer = { x: 0, y: 0, previousX: 0, previousY: 0 };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const layouts = [
    [.13,.42,.78], [.25,.22,.53], [.40,.36,.98], [.56,.19,.58],
    [.74,.34,.84], [.88,.23,.46], [.18,.68,.58], [.36,.72,.73],
    [.55,.67,.56], [.76,.69,.77], [.31,.49,.37], [.66,.50,.39],
    [.47,.88,.44], [.91,.54,.38], [.08,.82,.36], [.82,.86,.42],
    [.50,.48,.30], [.61,.84,.31]
  ];

  function fallback() {
    if (stage.querySelector(".studio__glass-fallback")) return;
    const field = document.createElement("div");
    field.className = "studio__glass-fallback";
    field.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 5; i++) {
      const orb = document.createElement("span");
      orb.className = "studio__glass-fallback-orb";
      field.appendChild(orb);
    }
    stage.appendChild(field);
    stage.classList.add("is-fallback");
  }

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vNormalView;
    varying vec3 vPositionView;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vPositionView = mv.xyz;
      vNormalView = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mv;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform float uSeed;
    uniform float uHover;
    uniform vec3 uTintA;
    uniform vec3 uTintB;
    varying vec2 vUv;
    varying vec3 vNormalView;
    varying vec3 vPositionView;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise21(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash21(i), hash21(i + vec2(1.0,0.0)), f.x),
        mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), f.x),
        f.y
      );
    }
    vec3 liquid(vec2 p, float seed) {
      float t = uTime * 0.34 + seed * 8.0;
      vec2 q = p - 0.5;
      float a = atan(q.y, q.x);
      float r = length(q);
      float warp = sin(q.x * 8.0 + sin(q.y * 6.0 + t) * 1.8 + t);
      warp += cos(q.y * 10.0 - q.x * 4.5 + t * 0.72) * 0.62;
      float ribbons = 0.5 + 0.5 * sin(a * 2.3 + r * 25.0 + warp * 2.8 - t);
      float grain = noise21(p * 8.0 + vec2(t * 0.22, -t * 0.16));
      float blend = smoothstep(0.18, 0.88, ribbons * 0.78 + grain * 0.22);
      vec3 col = mix(uTintA, uTintB, blend);
      float filament = pow(max(0.0, sin(ribbons * 16.0 + warp * 2.0)), 13.0);
      col += filament * vec3(0.62, 0.11, 0.19);
      float darkEdge = smoothstep(0.28, 0.76, r);
      col *= 1.0 - darkEdge * 0.34;
      return col;
    }

    void main() {
      vec3 n = normalize(vNormalView);
      vec3 viewDir = normalize(-vPositionView);
      float facing = max(dot(n, viewDir), 0.0);
      float fresnel = pow(1.0 - facing, 2.8);

      vec2 bend = n.xy * (0.035 + uHover * 0.014);
      float dispersion = 0.006 + fresnel * 0.018;
      vec3 redSample = liquid(vUv + bend + vec2(dispersion, 0.0), uSeed);
      vec3 greenSample = liquid(vUv + bend, uSeed + 0.13);
      vec3 blueSample = liquid(vUv + bend - vec2(dispersion, 0.0), uSeed + 0.27);
      vec3 color = vec3(redSample.r, greenSample.g, blueSample.b);

      vec3 lightDir = normalize(vec3(-0.42, 0.62, 0.72));
      vec3 halfDir = normalize(lightDir + viewDir);
      float specular = pow(max(dot(n, halfDir), 0.0), 34.0);
      float broadSpec = pow(max(dot(n, normalize(vec3(-0.62,0.76,0.28))), 0.0), 9.0);
      float rim = smoothstep(0.23, 0.94, fresnel);
      color = mix(color, vec3(0.79,0.83,0.91), fresnel * 0.48);
      color += vec3(0.74,0.045,0.14) * rim * (0.20 + uHover * 0.32);
      color += vec3(1.0,0.91,0.95) * specular * (0.82 + uHover * 0.7);
      color += vec3(0.54,0.22,0.29) * broadSpec * 0.24;
      color *= 0.92 + uHover * 0.12;

      float alpha = 0.76 + fresnel * 0.22 + specular * 0.08;
      gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.98));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  async function init() {
    try {
      const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js");
      if (!canvas || !canvas.getContext) throw new Error("Canvas unavailable");

      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !mobile,
        powerPreference: "low-power",
        premultipliedAlpha: true
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.7));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene = new THREE.Scene();

      viewHeight = 10.5;
      const initialAspect = Math.max(0.6, stage.clientWidth / Math.max(1, stage.clientHeight));
      viewWidth = viewHeight * initialAspect;
      camera = new THREE.OrthographicCamera(
        -viewWidth / 2, viewWidth / 2, viewHeight / 2, -viewHeight / 2, 0.1, 80
      );
      camera.position.z = 24;

      const geometry = new THREE.SphereGeometry(1, mobile ? 32 : 48, mobile ? 24 : 36);
      const palette = [
        ["#7b1535", "#4f3e9b"], ["#552044", "#bd244b"], ["#273e65", "#a42d5a"],
        ["#6b2246", "#b56c54"], ["#2f315f", "#a71b3e"], ["#4d1a39", "#6d5da9"]
      ];
      const count = mobile ? 10 : layouts.length;
      layouts.slice(0, count).forEach(([x, y, size], i) => {
        const [a, b] = palette[i % palette.length];
        const material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uTime: { value: i * 0.7 },
            uSeed: { value: i * 0.137 + 0.11 },
            uHover: { value: 0 },
            uTintA: { value: new THREE.Color(a) },
            uTintB: { value: new THREE.Color(b) }
          }
        });
        const mesh = new THREE.Mesh(geometry, material);
        const radius = size * (mobile ? 0.62 : 0.78);
        mesh.scale.setScalar(radius);
        mesh.position.set((x - 0.5) * viewWidth, (0.5 - y) * viewHeight, (i % 4) * 0.18);
        scene.add(mesh);
        orbs.push({
          mesh,
          home: mesh.position.clone(),
          velocity: new THREE.Vector3(),
          radius,
          phase: i * 1.71,
          baseScale: radius,
          hover: 0
        });
      });

      resize();
      stage.classList.add("is-ready");

      const observer = new IntersectionObserver(entries => {
        active = entries.some(entry => entry.isIntersecting);
        if (active) startLoop();
        else stopLoop();
      }, { rootMargin: "120px 0px 120px 0px", threshold: 0.02 });
      observer.observe(stage);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopLoop();
        else if (active) startLoop();
      });
      window.addEventListener("resize", resize, { passive: true });
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(resize);
        ro.observe(stage);
      }
      if (!coarsePointer) {
        stage.addEventListener("pointermove", onPointerMove, { passive: true });
        stage.addEventListener("pointerleave", () => { pointerInside = false; }, { passive: true });
      } else {
        stage.addEventListener("touchmove", onTouchMove, { passive: true });
      }
      if (reducedMotion) render(0);
      else if (active) startLoop();
    } catch (error) {
      console.warn("[Chopstick glass] WebGL scene unavailable; using CSS fallback.", error);
      fallback();
    }
  }

  function resize() {
    if (!renderer || !camera) return;
    width = Math.max(1, stage.clientWidth);
    height = Math.max(1, stage.clientHeight);
    const aspect = width / height;
    viewHeight = 10.5;
    viewWidth = viewHeight * aspect;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    const mobileNow = width < 700;
    if (orbs.length) {
      orbs.forEach((orb, i) => {
        const [x, y] = layouts[i];
        orb.home.set((x - 0.5) * viewWidth, (0.5 - y) * viewHeight, orb.home.z);
        orb.baseScale = layouts[i][2] * (mobileNow ? 0.62 : 0.78);
        if (reducedMotion) {
          orb.mesh.position.copy(orb.home);
          orb.mesh.scale.setScalar(orb.baseScale);
        }
      });
    }
    if (reducedMotion) render(0);
  }

  function onPointerMove(event) {
    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointer.x = (x / width - 0.5) * viewWidth;
    pointer.y = (0.5 - y / height) * viewHeight;
    pointerInside = true;
    const dx = x - pointer.previousX;
    const dy = y - pointer.previousY;
    const flick = Math.min(0.62, Math.hypot(dx, dy) / Math.max(width, height) * 3.2);
    if (flick > 0.025) {
      orbs.forEach(orb => {
        const ox = orb.mesh.position.x - pointer.x;
        const oy = orb.mesh.position.y - pointer.y;
        const distance = Math.hypot(ox, oy) || 0.001;
        const reach = orb.radius + 2.15;
        if (distance < reach) {
          const force = flick * (1 - distance / reach) * 5.2;
          orb.velocity.x += (ox / distance) * force;
          orb.velocity.y += (oy / distance) * force;
        }
      });
    }
    pointer.previousX = x;
    pointer.previousY = y;
    if (!reducedMotion) startLoop();
  }

  function onTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const rect = stage.getBoundingClientRect();
    pointer.x = ((touch.clientX - rect.left) / width - 0.5) * viewWidth;
    pointer.y = (0.5 - (touch.clientY - rect.top) / height) * viewHeight;
    pointerInside = true;
    if (!reducedMotion) startLoop();
  }

  function render(dt) {
    if (!renderer || !scene || !camera) return;
    const delta = clamp(dt, 0, 0.04);
    elapsed += delta;
    orbs.forEach((orb, i) => {
      const p = orb.mesh.position;
      const floatX = reducedMotion ? 0 : Math.sin(elapsed * 0.42 + orb.phase) * 0.055;
      const floatY = reducedMotion ? 0 : Math.cos(elapsed * 0.54 + orb.phase * 1.3) * 0.075;
      const fx = (orb.home.x + floatX - p.x) * 2.8;
      const fy = (orb.home.y + floatY - p.y) * 2.8;
      orb.velocity.x += fx * delta;
      orb.velocity.y += fy * delta;
      orb.velocity.multiplyScalar(Math.exp(-3.6 * delta));
      p.x += orb.velocity.x * delta;
      p.y += orb.velocity.y * delta;

      let targetHover = 0;
      if (pointerInside) {
        const d = Math.hypot(p.x - pointer.x, p.y - pointer.y);
        targetHover = clamp(1 - d / (orb.radius + 0.9), 0, 1);
      }
      orb.hover += (targetHover - orb.hover) * Math.min(1, delta * 9);
      orb.mesh.scale.setScalar(orb.baseScale * (1 + orb.hover * 0.065));
      orb.mesh.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * 0.27 + orb.phase) * 0.17;
      orb.mesh.rotation.x = reducedMotion ? 0 : Math.cos(elapsed * 0.24 + orb.phase) * 0.12;
      orb.mesh.material.uniforms.uTime.value = elapsed + orb.phase;
      orb.mesh.material.uniforms.uHover.value = orb.hover;
    });
    renderer.render(scene, camera);
  }

  function loop(now) {
    if (!active || document.hidden) { raf = 0; return; }
    const dt = lastTime ? (now - lastTime) / 1000 : 0.016;
    lastTime = now;
    render(dt);
    raf = requestAnimationFrame(loop);
  }
  function startLoop() {
    if (reducedMotion || raf || !active || document.hidden) return;
    lastTime = 0;
    raf = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!reducedMotion && renderer && scene && camera) render(0);
  }

  init();
})();
