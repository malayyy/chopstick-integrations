import { useEffect, useRef, useState } from 'react';
import ambientImage from './assets/ambient.webp';
import logoImage from './assets/chopstick-logo.webp';
import { FrameRenderer } from './FrameRenderer';
import { PerformanceController } from './PerformanceController';
import { ScrollController } from './ScrollController';
import { Timeline } from './Timeline';

const services = [
  ['01', 'CRM & sales systems', 'A clearer view of every lead, conversation, and next step.'],
  ['02', 'Workflow automation', 'Less repetitive work. More time for the work that matters.'],
  ['03', 'Integrations & data', 'The tools you already use, finally working together.'],
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [introStarted, setIntroStarted] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [logoDocked, setLogoDocked] = useState(false);

  useEffect(() => {
    if (
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>('.reveal-on-scroll'));
    if (!targets.length) return;
    document.documentElement.classList.add('has-scroll-reveal');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove('has-scroll-reveal');
    };
  }, []);

  // Progressive 300-frame scrubbing: load only the target and nearby frames.
  useEffect(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!canvas || !track) return;

    const renderer = new FrameRenderer(
      canvas,
      Timeline.TOTAL_FRAMES,
      PerformanceController.getOptimalCacheSize(),
    );

    let rafId: number | null = null;
    let latestFrame = 1;
    let didStart = false;
    let didComplete = false;
    let dockTimer: number | null = null;

    const onProgress = (progress: number) => {
      latestFrame = Timeline.getState(progress).targetFrame;

      const hasStarted = progress > 0.015;
      if (hasStarted !== didStart) {
        didStart = hasStarted;
        setIntroStarted(hasStarted);
      }

      const complete = progress >= 0.999;
      if (complete !== didComplete) {
        didComplete = complete;
        setIntroComplete(complete);
        if (dockTimer !== null) {
          window.clearTimeout(dockTimer);
          dockTimer = null;
        }
        if (complete) {
          dockTimer = window.setTimeout(() => {
            setLogoDocked(true);
            dockTimer = null;
          }, 480);
        } else {
          setLogoDocked(false);
        }
      }

      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        renderer.render(latestFrame);
      });
    };

    const scrollController = new ScrollController({ onProgress }, track);
    const onResize = () => {
      renderer.resize();
      onProgress(scrollController.getProgress());
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize, { passive: true });
    return () => {
      scrollController.destroy();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (dockTimer !== null) window.clearTimeout(dockTimer);
      renderer.destroy();
    };
  }, []);

  return (
    <main className="site-shell" id="top">
      <div
        className="ambient-background"
        style={{ backgroundImage: `url("${ambientImage}")` }}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className={`composition-canvas${introComplete ? ' is-complete' : ''}`}
        aria-label="300-frame Chopstick Integrations reveal controlled by scrolling"
      />
      <div ref={trackRef} className="scroll-track" aria-hidden="true" />

      <div className={`scroll-hint${introStarted ? ' is-hidden' : ''}`} aria-hidden="true">
        <span className="scroll-mouse"><i /></span>
        <span>SCROLL TO CONNECT</span>
        <b>↓</b>
      </div>

      <a
        className={`brand-lockup${introComplete ? ' is-visible' : ''}${logoDocked ? ' is-docked' : ''}`}
        href="#top"
        aria-label="Chopstick Integrations home"
      >
        <img src={logoImage} alt="" draggable={false} />
      </a>

      <header className={`site-header${introComplete ? ' is-visible' : ''}`}>
        <nav aria-label="Main navigation">
          <a href="#what-we-do">What we do</a>
          <a href="#journey">Our journey</a>
          <a className="nav-contact" href="#contact">Let's talk <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="hero full-screen" aria-labelledby="hero-title">
        <div className="hero-content reveal-on-scroll">
          <p className="eyebrow"><span /> INTEGRATIONS · AUTOMATION · SYSTEMS</p>
          <img className="hero-logo" src={logoImage} alt="Chopstick Integrations" />
          <h1 id="hero-title">Different tools.<br /><em>One connected system.</em></h1>
          <p className="hero-description">
            We connect the tools your business relies on, automate the busywork,
            and build systems that give your team room to move.
          </p>
          <a className="primary-link" href="#what-we-do">
            Explore what we build <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="hero-footer reveal-on-scroll" aria-hidden="true">
          <span>BUILT TO CONNECT</span>
          <span>01 — 03</span>
        </div>
      </section>

      <section className="content-section services-section full-screen" id="what-we-do">
        <div className="section-inner services-layout">
          <div className="section-heading reveal-on-scroll">
            <p className="eyebrow"><span /> WHAT WE DO</p>
            <h2>Less busywork.<br /><em>Better flow.</em></h2>
            <p className="section-copy">
              Practical digital systems that reduce friction and make everyday work feel easier.
            </p>
          </div>
          <div className="service-list">
            {services.map(([number, title, description]) => (
              <article className="service-row reveal-on-scroll" key={number}>
                <span className="service-number">{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                <span className="service-arrow" aria-hidden="true">↗</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-section journey-section full-screen" id="journey">
        <div className="section-inner journey-content reveal-on-scroll">
          <p className="eyebrow"><span /> OUR JOURNEY</p>
          <h2>Good systems should feel <em>simple.</em></h2>
          <p className="journey-copy">
            Chopstick started with one idea: technology should connect the dots,
            not create more work. We bring disconnected tools, messy processes,
            and manual tasks into one smoother way of working.
          </p>
          <div className="journey-note">
            <span className="note-line" />
            <span>Thoughtfully connected. Built around your business.</span>
          </div>
        </div>
      </section>

      <section className="content-section contact-section full-screen" id="contact">
        <div className="section-inner contact-content reveal-on-scroll">
          <p className="eyebrow"><span /> HAVE SOMETHING TO CONNECT?</p>
          <h2>Let's make it<br /><em>flow.</em></h2>
          <p className="section-copy">
            Tell us what's disconnected, repetitive, or getting in your team's way.
          </p>
          <a className="primary-link" href="mailto:hello@chopstickintegrations.com">
            Start a conversation <span aria-hidden="true">↗</span>
          </a>
        </div>
        <footer className="site-footer reveal-on-scroll">
          <span>CHOPSTICK INTEGRATIONS</span>
          <a href="#top">BACK TO TOP ↑</a>
          <span>DIFFERENT TOOLS. ONE CONNECTED SYSTEM.</span>
        </footer>
      </section>
    </main>
  );
}
