import ambientImage from './assets/ambient.webp';
import logoImage from './assets/chopstick-logo.webp';

const services = [
  ['01', 'CRM & sales systems', 'A clearer view of every lead, conversation, and next step.'],
  ['02', 'Workflow automation', 'Less repetitive work. More time for the work that matters.'],
  ['03', 'Integrations & data', 'The tools you already use, finally working together.'],
];

export default function App() {
  return (
    <main className="site-shell" id="top">
      <div
        className="ambient-background"
        style={{ backgroundImage: `url("${ambientImage}")` }}
        aria-hidden="true"
      />

      <header className="site-header">
        <a className="header-brand" href="#top" aria-label="Chopstick Integrations home">
          <img src={logoImage} alt="Chopstick Integrations" />
        </a>
        <nav aria-label="Main navigation">
          <a href="#what-we-do">What we do</a>
          <a href="#journey">Our journey</a>
          <a className="nav-contact" href="#contact">Let's talk <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="hero full-screen" aria-labelledby="hero-title">
        <div className="hero-content">
          <p className="eyebrow"><span /> INTEGRATIONS · AUTOMATION · SYSTEMS</p>
          <img className="hero-logo" src={logoImage} alt="Chopstick Integrations" />
          <h1 id="hero-title">Different tools.<br /><em>One connected system.</em></h1>
          <p className="hero-description">
            We connect the tools your business relies on, automate the busywork,
            and build systems that give your team room to move.
          </p>
          <a className="primary-link" href="#what-we-do">
            Scroll to explore <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="hero-footer" aria-hidden="true">
          <span>BUILT TO CONNECT</span>
          <span>01 — 03</span>
        </div>
      </section>

      <section className="content-section services-section full-screen" id="what-we-do">
        <div className="section-inner services-layout">
          <div className="section-heading">
            <p className="eyebrow"><span /> WHAT WE DO</p>
            <h2>Less busywork.<br /><em>Better flow.</em></h2>
            <p className="section-copy">
              Practical digital systems that reduce friction and make everyday work feel easier.
            </p>
          </div>
          <div className="service-list">
            {services.map(([number, title, description]) => (
              <article className="service-row" key={number}>
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
        <div className="section-inner journey-content">
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
        <div className="section-inner contact-content">
          <p className="eyebrow"><span /> HAVE SOMETHING TO CONNECT?</p>
          <h2>Let's make it<br /><em>flow.</em></h2>
          <p className="section-copy">
            Tell us what's disconnected, repetitive, or getting in your team's way.
          </p>
          <a className="primary-link" href="https://github.com/malayyy/chopstick-integrations" target="_blank" rel="noreferrer">
            Find us on GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
        <footer className="site-footer">
          <span>CHOPSTICK INTEGRATIONS</span>
          <a href="#top">BACK TO TOP ↑</a>
          <span>DIFFERENT TOOLS. ONE CONNECTED SYSTEM.</span>
        </footer>
      </section>
    </main>
  );
}
