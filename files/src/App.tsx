import { useEffect, useRef, useState } from 'react';
import ambientImage from './assets/ambient.webp';
import logoImage from './assets/chopstick-wordmark.svg';
import { FrameRenderer } from './FrameRenderer';
import { PerformanceController } from './PerformanceController';
import { ScrollController } from './ScrollController';
import { Timeline } from './Timeline';

export default function App() {
  const compositionRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [introComplete, setIntroComplete] = useState(false);
  const [logoDocked, setLogoDocked] = useState(false);

  useEffect(() => {
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
  }, []);

  return (
    <main className="site-shell" aria-label="Chopstick Integrations">
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
    </main>
  );
}
