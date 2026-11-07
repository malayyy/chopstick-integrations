(() => {
  'use strict';
  const STORAGE_KEY = 'chopstick-sound-enabled';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let context = null, master = null, droneGain = null, textureGain = null, textureFilter = null;
  let enabled = false, unlocked = false, previousProgress = null, previousFrame = 0, lastMotionAt = 0;
  let cue124Played = false, cue290Played = false, noiseBuffer = null, lastEventAt = 0;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chopstick-sound-control';
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', 'Enable sound');
  button.innerHTML = '<span class="chopstick-sound-dot" aria-hidden="true"></span><span class="chopstick-sound-label">SOUND OFF</span>';
  document.body.append(button);

  const style = document.createElement('style');
  style.textContent = '.chopstick-sound-control{position:fixed;right:max(22px,env(safe-area-inset-right));bottom:max(22px,env(safe-area-inset-bottom));z-index:20;display:inline-flex;align-items:center;gap:10px;min-height:42px;padding:0 15px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(12,10,12,.76);color:#f7f3f4;font:600 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.16em;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);cursor:pointer;transition:background .2s ease,border-color .2s ease,transform .2s ease,opacity .2s ease}.chopstick-sound-control:hover{border-color:rgba(218,35,65,.8);background:rgba(25,12,17,.9);transform:translateY(-1px)}.chopstick-sound-control:focus-visible{outline:2px solid #e52b4d;outline-offset:4px}.chopstick-sound-dot{width:6px;height:6px;border-radius:50%;background:#827b80;box-shadow:0 0 0 3px rgba(255,255,255,.06)}.chopstick-sound-control[aria-pressed="true"]{border-color:rgba(218,35,65,.62)}.chopstick-sound-control[aria-pressed="true"] .chopstick-sound-dot{background:#e52b4d;box-shadow:0 0 12px rgba(229,43,77,.75)}@media(max-width:620px){.chopstick-sound-control{right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));min-height:40px;padding:0 12px;font-size:9px}}@media(prefers-reduced-motion:reduce){.chopstick-sound-control{transition:none}}';
  document.head.append(style);

  function label(text) {
    button.querySelector('.chopstick-sound-label').textContent = text;
    button.setAttribute('aria-label', text === 'SOUND ON' ? 'Disable sound' : 'Enable sound');
    button.setAttribute('aria-pressed', String(enabled && unlocked));
  }
  function makeNoiseBuffer(ctx) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      previous = previous * 0.84 + (Math.random() * 2 - 1) * 0.16;
      data[i] = previous;
    }
    return buffer;
  }
  function createAudio() {
    if (context) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) { button.disabled = true; label('AUDIO UNAVAILABLE'); return; }
    context = new AudioCtx({ latencyHint: 'interactive' });
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    droneGain = context.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(master);
    const low = context.createOscillator(), fifth = context.createOscillator();
    const lowLevel = context.createGain(), fifthLevel = context.createGain();
    low.type = fifth.type = 'sine';
    low.frequency.value = 55;
    fifth.frequency.value = 82.41;
    lowLevel.gain.value = 0.58;
    fifthLevel.gain.value = 0.16;
    low.connect(lowLevel).connect(droneGain);
    fifth.connect(fifthLevel).connect(droneGain);
    low.start(); fifth.start();

    noiseBuffer = makeNoiseBuffer(context);
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    textureFilter = context.createBiquadFilter();
    textureFilter.type = 'lowpass';
    textureFilter.frequency.value = 700;
    textureFilter.Q.value = 0.55;
    textureGain = context.createGain();
    textureGain.gain.value = 0;
    noise.connect(textureFilter).connect(textureGain).connect(master);
    noise.start();
    document.addEventListener('visibilitychange', onVisibility);
  }
  function setParam(param, value, time = 0.22) {
    if (!context || !param) return;
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, time);
  }
  async function enableFromGesture() {
    createAudio();
    if (!context || button.disabled) return false;
    try {
      await context.resume();
      unlocked = context.state === 'running';
      if (!unlocked) return false;
      enabled = true;
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
      setParam(master.gain, 0.82, 0.18);
      label('SOUND ON');
      if (previousProgress !== null) updateSound(previousProgress, previousFrame, 0.016);
      return true;
    } catch (error) {
      console.warn('[Chopstick audio] Audio could not be started:', error);
      return false;
    }
  }
  function disable() {
    enabled = false;
    try { localStorage.setItem(STORAGE_KEY, '0'); } catch {}
    if (master) setParam(master.gain, 0, 0.12);
    label('SOUND OFF');
  }
  button.addEventListener('click', async () => {
    if (enabled && unlocked) { disable(); return; }
    label('LOADING SOUND');
    if (!await enableFromGesture()) label('TAP TO ENABLE');
  });

  function playWoodClick() {
    if (!enabled || !unlocked || !context) return;
    const now = context.currentTime;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'bandpass'; filter.frequency.setValueAtTime(1850, now); filter.Q.value = 1.1;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.19, now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);
    source.connect(filter).connect(envelope).connect(master);
    source.start(now); source.stop(now + 0.12);

    const body = context.createOscillator(), bodyGain = context.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(265, now);
    body.frequency.exponentialRampToValueAtTime(145, now + 0.075);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.075, now + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    body.connect(bodyGain).connect(master);
    body.start(now); body.stop(now + 0.1);
  }
  function playRevealChime() {
    if (!enabled || !unlocked || !context) return;
    const now = context.currentTime;
    for (const note of [{f:659.25,g:0.075,d:0.95},{f:987.77,g:0.043,d:1.15},{f:1318.51,g:0.022,d:1.3}]) {
      const osc = context.createOscillator(), amp = context.createGain(), filter = context.createBiquadFilter();
      osc.type = 'sine'; osc.frequency.value = note.f;
      filter.type = 'lowpass'; filter.frequency.value = 4200;
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(note.g, now + 0.025);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + note.d);
      osc.connect(filter).connect(amp).connect(master);
      osc.start(now); osc.stop(now + note.d + 0.04);
    }
  }
  function updateSound(progress, frame, dt) {
    if (!enabled || !unlocked || !context) return;
    const now = performance.now();
    const delta = previousProgress === null ? 0 : Math.abs(progress - previousProgress);
    const velocity = dt > 0 ? Math.min(3.2, delta / dt) : 0;
    if (velocity > 0.012) lastMotionAt = now;
    const moving = now - lastMotionAt < 190;
    const intensity = moving ? Math.min(1, Math.pow(velocity / 0.72, 0.62)) : 0;
    const ambience = reducedMotion ? 0 : intensity;
    setParam(droneGain.gain, 0.012 + ambience * 0.032, 0.28);
    setParam(textureGain.gain, ambience * 0.055, 0.16);
    setParam(textureFilter.frequency, 520 + ambience * 2450, 0.12);
    if (previousFrame < 124 && frame >= 124 && !cue124Played) { cue124Played = true; playWoodClick(); }
    if (previousFrame < 290 && frame >= 290 && !cue290Played) { cue290Played = true; playRevealChime(); }
    if (progress < 0.025) { cue124Played = false; cue290Played = false; }
  }
  function onProgress(event) {
    const detail = event.detail || {};
    const progress = Math.max(0, Math.min(1, Number(detail.progress) || 0));
    const frame = Math.max(0, Math.min(299, Number(detail.frame) || 0));
    const now = performance.now();
    const dt = lastEventAt ? Math.max(0.001, (now - lastEventAt) / 1000) : 0.016;
    lastEventAt = now;
    updateSound(progress, frame, dt);
    previousProgress = progress;
    previousFrame = frame;
  }
  function onVisibility() {
    if (!context) return;
    if (document.hidden) setParam(master.gain, 0, 0.08);
    else if (enabled && unlocked) setParam(master.gain, 0.82, 0.2);
  }
  window.addEventListener('chopstick:film-progress', onProgress, { passive: true });
  window.addEventListener('pagehide', () => {
    window.removeEventListener('chopstick:film-progress', onProgress);
    document.removeEventListener('visibilitychange', onVisibility);
    if (context && context.state !== 'closed') context.close().catch(() => {});
  }, { once: true });
  try { if (localStorage.getItem(STORAGE_KEY) === '1') label('TAP TO ENABLE'); } catch {}
})();