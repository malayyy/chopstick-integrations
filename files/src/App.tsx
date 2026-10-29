import { useEffect, useRef, useState } from 'react';
import ambientImage from './assets/ambient.webp';
import logoImage from './assets/chopstick-logo.webp';
import { FrameRenderer } from './FrameRenderer';
import { PerformanceController } from './PerformanceController';
import { ScrollController } from './ScrollController';
import { Timeline } from './Timeline';

export default function App() {
  const compositionRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [introComplete, setIntroComplete] = useState(false);
  const [logoDocked, setLogoDocked] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloadFailed, setPreloadFailed] = useState(false);
  const [preloadAttempt, setPreloadAttempt] = useState(0);

  // Download the complete frame sequence before revealing the site. This is a
  // network preload only: decoded 4K frames are NOT all retained in RAM.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const totalFrames = Timeline.TOTAL_FRAMES;
    const mobile = PerformanceController.isMobile();
    const concurrency = mobile ? 4 : 10;
    let nextFrame = 1;
    let completedFrames = 0;
    const failedFrames: number[] = [];

    setAssetsReady(false);
    setPreloadProgress(0);
    setPreloadFailed(false);

    const loadStaticImage = async (src: string) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      if (typeof image.decode === 'function') {
        await image.decode();
      } else {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('Static image failed to load'));
        });
      }
    };

    const loadFrame = async (frame: number) => {
      const url = `/ezgif-frame-${String(frame).padStart(3, '0')}.jpg`;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (cancelled) return;
        try {
          const response = await fetch(url, {
            cache: 'force-cache',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Frame ${frame} returned HTTP ${response.status}`);
          // Consume the body so the browser completes the transfer and can cache it.
          await response.arrayBuffer();
          return;
        } catch (error) {
          if (cancelled || controller.signal.aborted) return;
          lastError = error;
        }
      }
      failedFrames.push(frame);
      if (lastError) console.error('Unable to preload animation frame', frame, lastError);
    };

    const worker = async () => {
      while (!cancelled) {
        const frame = nextFrame;
        nextFrame += 1;
        if (frame > totalFrames) return;
        await loadFrame(frame);
        if (cancelled) return;
        completedFrames += 1;
        setPreloadProgress(completedFrames / totalFrames);
      }
    };

    const preloadAll = async () => {
      try {
        await Promise.all([
          loadStaticImage(ambientImage),
          loadStaticImage(logoImage),
          ...Array.from({ length: concurrency }, () => worker()),
        ]);
        if (cancelled) return;
        if (failedFrames.length > 0) {
          setPreloadFailed(true);
          return;
        }
        setPreloadProgress(1);
        setAssetsReady(true);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        console.error('The cinematic experience could not finish preloading.', error);
        setPreloadFailed(true);
      }
    };

    void preloadAll();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [preloadAttempt]);

  // Keep the document still behind the loader so scroll progress always starts at zero.
  useEffect(() => {
    if (assetsReady) return;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [assetsReady]);

  useEffect(() => {
    if (!assetsReady) return;
    const canvas = compositionRef.current;
    const track = trackRef.current;
    if (!canvas || !track) return;

    const renderer = new FrameRenderer(
      canvas,
      Timeline.TOTAL_FRAMES,
      PerformanceController.getOptimalCacheSize(),
    );

    let rafId: number | null = null;
    let latestFrame = 1;
    let phaseComplete = false;
    let dockTimer: number | null = null;

    const updateEndPhase = (complete: boolean) => {
      if (complete === phaseComplete) return;
      phaseComplete = complete;
      setIntroComplete(complete);

      if (dockTimer !== null) {
        window.clearTimeout(dockTimer);
        dockTimer = null;
      }

      if (complete) {
        // The logo fades in first; then hold it centered for ~500 ms before docking.
        dockTimer = window.setTimeout(() => {
          setLogoDocked(true);
          dockTimer = null;
        }, 900);
      } else {
        setLogoDocked(false);
      }
    };

    const requestRender = (progress: number) => {
      latestFrame = Timeline.getState(progress).targetFrame;
      updateEndPhase(progress >= 0.9999);
      if (rafId !== null) return;

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        renderer.render(latestFrame);
      });
    };

    const scrollController = new ScrollController({ onProgress: requestRender }, track);

    const handleResize = () => {
      renderer.resize();
      requestRender(scrollController.getProgress());
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('pageshow', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize, { passive: true });

    return () => {
      scrollController.destroy();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pageshow', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (dockTimer !== null) window.clearTimeout(dockTimer);
      renderer.destroy();
    };
  }, [assetsReady]);

  return (
    <main className="site-shell" aria-label="Chopstick Integrations" aria-busy={!assetsReady}>
      <div
        className="ambient-background"
        style={{ backgroundImage: `url("${ambientImage}")` }}
        aria-hidden="true"
      />
      <div className="ambient-particles" aria-hidden="true" />

      <canvas
        ref={compositionRef}
        className={`composition-canvas${introComplete ? ' is-complete' : ''}`}
        aria-label="Cinematic Chopstick Integrations reveal. Scroll to move through the sequence."
      />

      <div ref={trackRef} className="scroll-track" aria-hidden="true" />

      <img
        src={logoImage}
        alt="Chopstick Integrations"
        className={`brand-lockup${introComplete ? ' is-visible' : ''}${logoDocked ? ' is-docked' : ''}`}
        draggable={false}
      />

      <header className={`site-header${logoDocked ? ' is-visible' : ''}`}>
        <nav aria-label="Main navigation">
          <a href="#capabilities">Capabilities</a>
          <a href="#contact">Contact <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <div className={`homepage${logoDocked ? ' is-visible' : ''}`}>
        <section className="home-hero" id="home">
          <p className="eyebrow"><span /> INTEGRATIONS · AUTOMATION · SYSTEMS</p>
          <h1>
            Make your systems
            <br />
            work <em>together.</em>
          </h1>
          <p className="hero-description">
            We connect the tools your business relies on, automate the busywork,
            and build digital systems that give your team room to move.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#capabilities">
              Explore what we build <span aria-hidden="true">↘</span>
            </a>
            <a className="secondary-link" href="#contact">
              Start a conversation <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="hero-index" aria-hidden="true">
            <span>CHOPSTICK INTEGRATIONS</span>
            <span>BUILT TO CONNECT <i>—</i> 01 / 03</span>
          </div>
        </section>

        <section className="capabilities" id="capabilities">
          <div className="section-intro">
            <p className="eyebrow"><span /> WHAT WE CONNECT</p>
            <h2>Less busywork.<br /><em>Better flow.</em></h2>
          </div>
          <div className="capability-list">
            <div><span>01</span><p>CRM & sales systems</p><b>↗</b></div>
            <div><span>02</span><p>Workflow automation</p><b>↗</b></div>
            <div><span>03</span><p>Integrations & data</p><b>↗</b></div>
            <div><span>04</span><p>Custom digital tools</p><b>↗</b></div>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <p className="eyebrow"><span /> HAVE A SYSTEM TO CONNECT?</p>
          <h2>Let's make it <em>flow.</em></h2>
          <p>Tell us what's disconnected, repetitive, or getting in your team's way.</p>
          <a className="primary-link" href="https://github.com/malayyy/chopstick-integrations" target="_blank" rel="noreferrer">
            Explore the build <span aria-hidden="true">↗</span>
          </a>
        </section>

        <footer className="site-footer">
          <span>CHOPSTICK INTEGRATIONS</span>
          <span>Different tools. One connected system.</span>
        </footer>
      </div>

      {!assetsReady && (
        <section className="preloader-overlay" role="status" aria-live="polite" aria-label="Preparing the cinematic experience">
          <div className="preloader-content">
            <div className="preloader-emblem" aria-hidden="true">
              <span className="preloader-orbit preloader-orbit--outer" />
              <span className="preloader-orbit preloader-orbit--inner" />
              <span className="preloader-chopstick preloader-chopstick--one" />
              <span className="preloader-chopstick preloader-chopstick--two" />
              <span className="preloader-flare" />
              <span className="preloader-spark preloader-spark--one" />
              <span className="preloader-spark preloader-spark--two" />
            </div>

            <p className="preloader-kicker"><span /> CHOPSTICK INTEGRATIONS</p>
            <h1 className="preloader-title">
              Great things<br />
              <em>take time.</em>
            </h1>
            <p className="preloader-copy">
              Setting every frame into place. Your experience is worth the wait.
            </p>

            {preloadFailed ? (
              <div className="preloader-error">
                <p>A few frames did not arrive. Let's give them another shot.</p>
                <button type="button" onClick={() => setPreloadAttempt((attempt) => attempt + 1)}>
                  Retry loading <span aria-hidden="true">↻</span>
                </button>
              </div>
            ) : (
              <div className="preloader-progress" aria-label={`${Math.floor(preloadProgress * Timeline.TOTAL_FRAMES)} of ${Timeline.TOTAL_FRAMES} frames loaded`}>
                <div className="preloader-progress-meta">
                  <span>PREPARING THE REVEAL</span>
                  <span>{String(Math.floor(preloadProgress * Timeline.TOTAL_FRAMES)).padStart(3, '0')} / {Timeline.TOTAL_FRAMES}</span>
                </div>
                <div className="preloader-progress-track">
                  <span style={{ width: `${Math.min(100, preloadProgress * 100)}%` }} />
                </div>
                <p className="preloader-footnote">Please wait while the cinematic frames load</p>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
