import Head from 'next/head';
import { PROTO_COPY } from '@/components/marketing/protoCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';

// Direction C — "The mutual" (cooperative-bank modernism).
// Genre: modern mutual / credit-union rebrand x Mercury-grade product presentation.
// Self-contained prototype: plain HTML + styled-jsx only. No Chakra, no theme tokens.
// Fonts declared in <Head> below (Fraunces + Instrument Sans from public/fonts/proto,
// IBM Plex Mono already hosted app-wide via globals.css).
//
// Palette (BRIEF §9 Direction C):
//   evergreen #0E2A23 (brand ink / hero / footer)  · sand #F4F1EA (light bg)
//   ink #14231E (text on sand)  · ink-soft #43554D  · paper-on-dark #F2EFE6
//   gold #C9A227 (chips/rules/highlights on dark)   · gold-deep #8A6D1C (on sand, large)
//
// Data chips use ONLY numbers visible in the actual captures:
//   tasks-board.webp : 50 / 40 / 15 / 10 / 8 / 5 Shares, columns Open/In Progress/In Review/Completed
//   task-detail.webp : Reward 50 Shares, claimed by emmaphilosopher, EASY, 1H
//   treasury.webp    : Profit Share #4 / #3 / #2, 1.00 / 1.00 / 0.50 BREAD, 100% claimed, 3 / 3 / 2 members claimed
//   treasury-stats   : 3 members sharing, 3 total distributed, 4 distributions

const shots = PRODUCT_SHOTS;

export default function ProtoC() {
  return (
    <div className="mutual">
      <Head>
        <title>Poa direction C prototype</title>
        <meta name="robots" content="noindex" />
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
            @font-face {
              font-family: 'Fraunces C';
              font-style: normal;
              font-weight: 300 700;
              font-display: swap;
              src: url('/fonts/proto/c-fraunces-vf.woff2') format('woff2');
            }
            @font-face {
              font-family: 'Instrument Sans C';
              font-style: normal;
              font-weight: 400 700;
              font-display: swap;
              src: url('/fonts/proto/c-instrument-sans-vf.woff2') format('woff2');
            }`,
          }}
        />
      </Head>

      {/* ───────────────────────── NAV ───────────────────────── */}
      <header className="nav-band">
        <div className="wrap nav">
          <a className="brand" href="#top">
            <span className="brand-mark" aria-hidden="true">
              <span className="brand-dot" />
            </span>
            <span className="brand-word">Poa</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            {PROTO_COPY.nav.links.map((l) => (
              <a key={l} href="#" className="nav-link">
                {l}
              </a>
            ))}
          </nav>
          <div className="nav-actions">
            <a href="#" className="nav-signin">
              {PROTO_COPY.nav.signIn}
            </a>
            <a href="#" className="btn btn-gold">
              {PROTO_COPY.nav.cta}
            </a>
          </div>
        </div>
      </header>

      {/* ───────────────────────── HERO (full-bleed evergreen) ───────────────────────── */}
      <section className="hero" id="top">
        <div className="hero-grain" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow poa-fade">
              <span className="eyebrow-rule" aria-hidden="true" />
              {PROTO_COPY.hero.eyebrow}
            </p>
            <h1 className="hero-title poa-fade" style={{ animationDelay: '0.05s' }}>
              Do the work.
              <br />
              <span className="hero-title-em">Own the upside.</span>
            </h1>
            <p className="hero-sub poa-fade" style={{ animationDelay: '0.12s' }}>
              {PROTO_COPY.hero.subline}
            </p>
            <div className="hero-cta poa-fade" style={{ animationDelay: '0.18s' }}>
              <a href="#" className="btn btn-gold btn-lg">
                {PROTO_COPY.hero.ctaPrimary}
              </a>
              <a href="#" className="btn btn-ghost btn-lg">
                {PROTO_COPY.hero.ctaSecondary}
              </a>
            </div>
            <p className="hero-quiet poa-fade" style={{ animationDelay: '0.24s' }}>
              {PROTO_COPY.hero.quiet}
            </p>
          </div>

          {/* Hero statement panel: the task payout card, chips beside it */}
          <div className="hero-panel poa-rise" style={{ animationDelay: '0.14s' }}>
            <figure className="panel panel-dark">
              <img
                src={shots.taskDetail.src}
                width={shots.taskDetail.width / 2}
                height={shots.taskDetail.height / 2}
                alt={shots.taskDetail.alt}
                className="panel-img"
              />
            </figure>
            <div className="hero-chips">
              <span className="chip chip-gold">reward · 50 shares</span>
              <span className="chip chip-line">claimed by emmaphilosopher</span>
              <span className="chip chip-line">approved · ownership issued</span>
            </div>
          </div>
        </div>

        {/* Trust ledger strip across the base of the dark hero */}
        <div className="wrap hero-ledger poa-fade" style={{ animationDelay: '0.3s' }}>
          <div className="ledger-item">
            <span className="ledger-num">4</span>
            <span className="ledger-label">profit shares distributed</span>
          </div>
          <span className="ledger-div" aria-hidden="true" />
          <div className="ledger-item">
            <span className="ledger-num">100%</span>
            <span className="ledger-label">claimed by the members who earned it</span>
          </div>
          <span className="ledger-div" aria-hidden="true" />
          <div className="ledger-item">
            <span className="ledger-num">$0</span>
            <span className="ledger-label">Poa charges to participate</span>
          </div>
        </div>
      </section>

      {/* ───────────────────────── PAIN → UPSIDE (sand band) ───────────────────────── */}
      <section className="band band-sand upside">
        <div className="wrap">
          <div className="sec-head">
            <span className="gold-rule" aria-hidden="true" />
            <p className="kicker">{PROTO_COPY.pain.kicker}</p>
            <h2 className="sec-title">{PROTO_COPY.pain.heading}</h2>
            <p className="sec-lead">{PROTO_COPY.pain.lead}</p>
          </div>

          <ol className="upside-list">
            {PROTO_COPY.pain.items.map((item, i) => (
              <li key={item.title} className="upside-row">
                <span className="upside-index">{String(i + 1).padStart(2, '0')}</span>
                <div className="upside-body">
                  <h3 className="upside-title">{item.title}</h3>
                  <p className="upside-text">{item.body}</p>
                </div>
                <span className="upside-chip">
                  {i === 0 && 'issued on approval'}
                  {i === 1 && 'split by earned share'}
                  {i === 2 && 'one person, one vote'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────────────────── PRODUCT PROOF — panels overlapping band boundary ───────── */}
      <section className="proof">
        {/* Top half evergreen, bottom half sand; the panels straddle the seam */}
        <div className="proof-dark">
          <div className="wrap">
            <div className="sec-head proof-head">
              <span className="gold-rule" aria-hidden="true" />
              <p className="kicker kicker-on-dark">{PROTO_COPY.proof.kicker}</p>
              <h2 className="sec-title sec-title-on-dark">{PROTO_COPY.proof.heading}</h2>
            </div>
          </div>
        </div>

        <div className="proof-light">
          <div className="wrap">
            {/* Panel 1 — tasks board (overlaps the dark/light seam) */}
            <div className="proof-item proof-item-a">
              <figure className="panel panel-dark proof-panel">
                <img
                  src={shots.tasksBoard.src}
                  width={shots.tasksBoard.width / 2}
                  height={shots.tasksBoard.height / 2}
                  alt={shots.tasksBoard.alt}
                  className="panel-img"
                />
              </figure>
              <div className="proof-meta">
                <p className="figtag">fig. 01 · the work</p>
                <p className="proof-caption">{PROTO_COPY.proof.shots[0].caption}</p>
                <div className="proof-chips">
                  <span className="chip chip-sand">open · in progress · in review · completed</span>
                  <span className="chip chip-sand-gold">50 shares · task approved</span>
                  <span className="chip chip-sand">payouts from 5 to 50 shares</span>
                </div>
              </div>
            </div>

            {/* Panel 2 — treasury distributions (reversed) */}
            <div className="proof-item proof-item-b">
              <figure className="panel panel-dark proof-panel">
                <img
                  src={shots.treasury.src}
                  width={shots.treasury.width / 2}
                  height={shots.treasury.height / 2}
                  alt={shots.treasury.alt}
                  className="panel-img"
                />
              </figure>
              <div className="proof-meta">
                <p className="figtag">fig. 02 · the money</p>
                <p className="proof-caption">{PROTO_COPY.proof.shots[1].caption}</p>
                <div className="proof-chips">
                  <span className="chip chip-sand-gold">profit share #4 · 100% claimed</span>
                  <span className="chip chip-sand">1.00 bread · 3 members claimed</span>
                  <span className="chip chip-sand">profit share #2 · 0.50 bread</span>
                </div>
              </div>
            </div>

            <p className="proof-supporting">
              <span className="proof-supporting-mark" aria-hidden="true" />
              {PROTO_COPY.proof.supporting}
            </p>
          </div>
        </div>
      </section>

      {/* ───────────────────────── FOOTER (evergreen bookend) ───────────────────────── */}
      <footer className="footer">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <a className="brand" href="#top">
              <span className="brand-mark" aria-hidden="true">
                <span className="brand-dot" />
              </span>
              <span className="brand-word">Poa</span>
            </a>
            <p className="footer-tag">{PROTO_COPY.footer.tagline}</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            {PROTO_COPY.footer.links.map((l) => (
              <a key={l} href="#" className="footer-link">
                {l}
              </a>
            ))}
          </nav>
          <p className="footer-self">{PROTO_COPY.footer.selfHost}</p>
        </div>
        <div className="wrap footer-rule-row">
          <span className="footer-year">Poa · a member owned network</span>
          <span className="footer-charter">Start something that lasts.</span>
        </div>
      </footer>

      {/* ───────────────────────── STYLES ───────────────────────── */}
      <style jsx>{`
        .mutual {
          --evergreen: #0e2a23;
          --evergreen-2: #0b221c;
          --sand: #f4f1ea;
          --ink: #14231e;
          --ink-soft: #43554d;
          --paper-dark: #f2efe6;
          --gold: #c9a227;
          --gold-deep: #8a6d1c;
          --hairline-dark: rgba(242, 239, 230, 0.14);
          --panel-border-dark: rgba(201, 162, 39, 0.28);
          --serif: 'Fraunces C', 'Fraunces', Georgia, serif;
          --sans: 'Instrument Sans C', 'Instrument Sans', -apple-system,
            'Segoe UI', system-ui, sans-serif;
          --mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;

          font-family: var(--sans);
          color: var(--ink);
          background: var(--sand);
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }
        .mutual :global(*) {
          box-sizing: border-box;
        }

        .wrap {
          max-width: 1140px;
          margin: 0 auto;
          padding: 0 40px;
        }

        /* ---------- buttons ---------- */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: var(--sans);
          font-weight: 600;
          font-size: 15px;
          letter-spacing: 0.005em;
          border-radius: 10px;
          padding: 11px 20px;
          text-decoration: none;
          transition: transform 0.16s ease, background 0.16s ease,
            box-shadow 0.16s ease, border-color 0.16s ease;
          cursor: pointer;
          white-space: nowrap;
        }
        .btn-lg {
          font-size: 16px;
          padding: 15px 26px;
        }
        .btn-gold {
          background: var(--gold);
          color: #23200f;
          box-shadow: 0 1px 2px rgba(14, 42, 35, 0.18);
        }
        .btn-gold:hover {
          background: #d6ae2f;
          transform: translateY(-1px);
        }
        .btn-ghost {
          background: transparent;
          color: var(--paper-dark);
          border: 1px solid var(--hairline-dark);
        }
        .btn-ghost:hover {
          border-color: var(--gold);
          color: #fff;
        }

        /* ---------- nav ---------- */
        .nav-band {
          background: var(--evergreen);
          border-bottom: 1px solid var(--hairline-dark);
          position: relative;
          z-index: 5;
        }
        .nav {
          display: flex;
          align-items: center;
          gap: 28px;
          height: 72px;
        }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
        }
        .brand-mark {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 1.5px solid var(--gold);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .brand-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--gold);
        }
        .brand-word {
          font-family: var(--serif);
          font-weight: 600;
          font-size: 22px;
          color: var(--paper-dark);
          font-variation-settings: 'opsz' 40, 'wght' 560, 'SOFT' 40;
          letter-spacing: 0.01em;
        }
        .nav-links {
          display: flex;
          gap: 26px;
          margin-left: 14px;
        }
        .nav-link {
          font-size: 14.5px;
          color: rgba(242, 239, 230, 0.72);
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .nav-link:hover {
          color: var(--paper-dark);
        }
        .nav-actions {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .nav-signin {
          font-size: 14.5px;
          color: rgba(242, 239, 230, 0.82);
          text-decoration: none;
        }
        .nav-signin:hover {
          color: var(--paper-dark);
        }

        /* ---------- hero (full-bleed evergreen) ---------- */
        .hero {
          position: relative;
          background: radial-gradient(
              120% 90% at 78% -10%,
              rgba(201, 162, 39, 0.1) 0%,
              rgba(201, 162, 39, 0) 46%
            ),
            linear-gradient(180deg, #103029 0%, var(--evergreen) 42%, var(--evergreen-2) 100%);
          color: var(--paper-dark);
          padding: 74px 0 0;
          overflow: hidden;
        }
        .hero-grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.5;
          background-image: radial-gradient(
            rgba(242, 239, 230, 0.04) 1px,
            transparent 1px
          );
          background-size: 4px 4px;
        }
        .hero-grid {
          position: relative;
          display: grid;
          grid-template-columns: 1.08fr 1fr;
          gap: 56px;
          align-items: center;
        }
        .eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: var(--mono);
          font-size: 12.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--gold);
          margin: 0 0 22px;
        }
        .eyebrow-rule {
          width: 34px;
          height: 2px;
          background: var(--gold);
          display: inline-block;
        }
        .hero-title {
          font-family: var(--serif);
          font-variation-settings: 'opsz' 144, 'wght' 560, 'SOFT' 40;
          font-weight: 560;
          font-size: clamp(2.75rem, 6.5vw, 5.25rem);
          line-height: 0.98;
          letter-spacing: -0.018em;
          margin: 0 0 24px;
          color: #fbf9f2;
        }
        .hero-title-em {
          font-style: italic;
          font-variation-settings: 'opsz' 144, 'wght' 500, 'SOFT' 60;
          color: var(--gold);
        }
        .hero-sub {
          font-size: 18px;
          line-height: 1.6;
          color: rgba(242, 239, 230, 0.82);
          max-width: 30em;
          margin: 0 0 30px;
        }
        .hero-cta {
          display: flex;
          gap: 14px;
          margin: 0 0 22px;
          flex-wrap: wrap;
        }
        .hero-quiet {
          font-family: var(--mono);
          font-size: 12.5px;
          letter-spacing: 0.02em;
          color: rgba(242, 239, 230, 0.5);
          margin: 0;
        }

        /* hero panel + chips */
        .hero-panel {
          position: relative;
        }
        .panel {
          margin: 0;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid var(--panel-border-dark);
          box-shadow: 0 2px 6px rgba(14, 42, 35, 0.1),
            0 24px 64px rgba(14, 42, 35, 0.4);
          background: #0c0a12;
        }
        .panel-img {
          display: block;
          width: 100%;
          height: auto;
        }
        .hero-panel .panel {
          transform: rotate(0.4deg);
        }
        .hero-chips {
          margin-top: 20px;
          margin-left: -22px;
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          align-items: center;
        }
        .chip {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.01em;
          padding: 6px 12px;
          border-radius: 999px;
          white-space: nowrap;
          line-height: 1;
        }
        .chip-gold {
          background: var(--gold);
          color: #23200f;
          font-weight: 500;
          box-shadow: 0 4px 14px rgba(14, 42, 35, 0.45);
        }
        .chip-line {
          background: rgba(11, 34, 28, 0.86);
          color: var(--paper-dark);
          border: 1px solid var(--gold);
          box-shadow: 0 4px 14px rgba(14, 42, 35, 0.35);
        }

        /* hero ledger strip */
        .hero-ledger {
          position: relative;
          display: flex;
          align-items: center;
          gap: 30px;
          margin-top: 66px;
          padding: 26px 0 30px;
          border-top: 1px solid var(--hairline-dark);
        }
        .ledger-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ledger-num {
          font-family: var(--serif);
          font-variation-settings: 'opsz' 144, 'wght' 600, 'SOFT' 30;
          font-size: 42px;
          line-height: 1;
          color: var(--gold);
          letter-spacing: -0.01em;
        }
        .ledger-label {
          font-family: var(--mono);
          font-size: 11.5px;
          letter-spacing: 0.02em;
          color: rgba(242, 239, 230, 0.62);
          max-width: 20ch;
        }
        .ledger-div {
          width: 1px;
          align-self: stretch;
          background: var(--hairline-dark);
        }

        /* ---------- section shared ---------- */
        .band {
          padding: 96px 0;
        }
        .band-sand {
          background: var(--sand);
        }
        .sec-head {
          max-width: 640px;
        }
        .gold-rule {
          display: block;
          width: 40px;
          height: 2px;
          background: var(--gold-deep);
          margin-bottom: 22px;
        }
        .kicker {
          font-family: var(--mono);
          font-size: 12.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--gold-deep);
          margin: 0 0 14px;
        }
        .kicker-on-dark {
          color: var(--gold);
        }
        .sec-title {
          font-family: var(--serif);
          font-variation-settings: 'opsz' 96, 'wght' 540, 'SOFT' 40;
          font-weight: 540;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1.04;
          letter-spacing: -0.015em;
          margin: 0 0 18px;
          color: var(--ink);
        }
        .sec-title-on-dark {
          color: #fbf9f2;
        }
        .sec-lead {
          font-size: 18px;
          line-height: 1.62;
          color: var(--ink-soft);
          margin: 0;
        }

        /* ---------- upside list ---------- */
        .upside-list {
          list-style: none;
          margin: 54px 0 0;
          padding: 0;
          border-top: 1px solid rgba(20, 35, 30, 0.14);
        }
        .upside-row {
          display: grid;
          grid-template-columns: 72px 1fr 190px;
          gap: 28px;
          align-items: baseline;
          padding: 32px 0;
          border-bottom: 1px solid rgba(20, 35, 30, 0.14);
        }
        .upside-index {
          font-family: var(--mono);
          font-size: 15px;
          color: var(--gold-deep);
          padding-top: 4px;
        }
        .upside-title {
          font-family: var(--serif);
          font-variation-settings: 'opsz' 72, 'wght' 560, 'SOFT' 40;
          font-size: 25px;
          line-height: 1.1;
          letter-spacing: -0.01em;
          margin: 0 0 8px;
          color: var(--ink);
        }
        .upside-text {
          font-size: 16.5px;
          line-height: 1.58;
          color: var(--ink-soft);
          margin: 0;
          max-width: 42ch;
        }
        .upside-chip {
          justify-self: end;
          align-self: center;
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.03em;
          color: var(--ink);
          background: rgba(201, 162, 39, 0.13);
          border: 1px solid rgba(138, 109, 28, 0.4);
          border-radius: 999px;
          padding: 7px 14px;
          white-space: nowrap;
          text-align: center;
        }

        /* ---------- product proof (overlapping panels) ---------- */
        .proof {
          position: relative;
        }
        .proof-dark {
          background: var(--evergreen);
          padding: 90px 0 200px;
        }
        .proof-head {
          max-width: 720px;
        }
        .proof-light {
          background: var(--sand);
          padding: 0 0 100px;
        }
        .proof-item {
          display: grid;
          grid-template-columns: 1.55fr 1fr;
          gap: 44px;
          align-items: center;
        }
        /* First panel pulls up to straddle the dark/light seam */
        .proof-item-a {
          margin-top: -160px;
        }
        .proof-item-b {
          margin-top: 92px;
          grid-template-columns: 1fr 1.55fr;
        }
        .proof-item-b .proof-panel {
          order: 2;
        }
        .proof-item-b .proof-meta {
          order: 1;
        }
        .proof-panel {
          border-radius: 14px;
          border: 1px solid rgba(14, 42, 35, 0.14);
          box-shadow: 0 2px 6px rgba(14, 42, 35, 0.1),
            0 24px 64px rgba(14, 42, 35, 0.18);
        }
        .figtag {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gold-deep);
          margin: 0 0 12px;
        }
        .proof-caption {
          font-family: var(--serif);
          font-variation-settings: 'opsz' 60, 'wght' 480, 'SOFT' 50;
          font-size: 21px;
          line-height: 1.28;
          letter-spacing: -0.005em;
          color: var(--ink);
          margin: 0 0 20px;
        }
        .proof-chips {
          display: flex;
          flex-direction: column;
          gap: 9px;
          align-items: flex-start;
        }
        .chip-sand {
          background: #fbf9f3;
          color: var(--ink);
          border: 1px solid rgba(20, 35, 30, 0.14);
        }
        .chip-sand-gold {
          background: rgba(201, 162, 39, 0.16);
          color: #4d3d0c;
          border: 1px solid var(--gold-deep);
          font-weight: 500;
        }
        .proof-supporting {
          display: flex;
          align-items: center;
          gap: 16px;
          max-width: 720px;
          margin: 92px auto 0;
          font-family: var(--serif);
          font-variation-settings: 'opsz' 72, 'wght' 460, 'SOFT' 50;
          font-size: clamp(1.35rem, 2.4vw, 1.85rem);
          line-height: 1.32;
          letter-spacing: -0.01em;
          color: var(--ink);
          text-align: center;
          justify-content: center;
        }
        .proof-supporting-mark {
          display: none;
        }

        /* ---------- footer (evergreen bookend) ---------- */
        .footer {
          background: var(--evergreen);
          color: var(--paper-dark);
          padding: 66px 0 34px;
        }
        .footer-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1.3fr;
          gap: 40px;
          align-items: start;
          padding-bottom: 44px;
          border-bottom: 1px solid var(--hairline-dark);
        }
        .footer-tag {
          font-size: 14px;
          color: rgba(242, 239, 230, 0.6);
          margin: 16px 0 0;
          max-width: 22ch;
          line-height: 1.5;
        }
        .footer-links {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .footer-link {
          font-size: 14.5px;
          color: rgba(242, 239, 230, 0.78);
          text-decoration: none;
          width: fit-content;
        }
        .footer-link:hover {
          color: var(--gold);
        }
        .footer-self {
          font-size: 14.5px;
          line-height: 1.6;
          color: rgba(242, 239, 230, 0.72);
          margin: 0;
          max-width: 34ch;
        }
        .footer-rule-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 26px;
          gap: 20px;
        }
        .footer-year {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.03em;
          color: rgba(242, 239, 230, 0.5);
        }
        .footer-charter {
          font-family: var(--serif);
          font-variation-settings: 'opsz' 40, 'wght' 460, 'SOFT' 60;
          font-style: italic;
          font-size: 15px;
          color: rgba(242, 239, 230, 0.62);
        }

        /* ───────────────── responsive ───────────────── */
        @media (max-width: 940px) {
          .hero-grid {
            grid-template-columns: 1fr;
            gap: 44px;
          }
          .hero-panel {
            max-width: 520px;
          }
          .proof-item,
          .proof-item-b {
            grid-template-columns: 1fr;
            gap: 26px;
          }
          .proof-item-b .proof-panel {
            order: 1;
          }
          .proof-item-b .proof-meta {
            order: 2;
          }
          .proof-item-b {
            margin-top: 56px;
          }
          .footer-grid {
            grid-template-columns: 1fr 1fr;
          }
          .footer-self {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 620px) {
          .wrap {
            padding: 0 20px;
          }
          .nav-links,
          .nav-signin {
            display: none;
          }
          .nav {
            height: 62px;
            gap: 12px;
          }
          .hero {
            padding: 46px 0 0;
          }
          .hero-title {
            font-size: clamp(2.6rem, 13vw, 3.5rem);
          }
          .hero-sub {
            font-size: 16.5px;
          }
          .hero-cta .btn {
            flex: 1 1 auto;
          }
          .hero-panel {
            max-width: none;
            margin-bottom: 30px;
          }
          .hero-chips {
            position: static;
            flex-direction: row;
            flex-wrap: wrap;
            margin-top: 22px;
            left: 0;
            bottom: 0;
          }
          .chip {
            font-size: 11px;
            padding: 6px 10px;
          }
          .hero-ledger {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
            margin-top: 44px;
          }
          .ledger-div {
            display: none;
          }
          .ledger-num {
            font-size: 36px;
          }
          .ledger-label {
            max-width: none;
          }
          .band {
            padding: 62px 0;
          }
          .upside-row {
            grid-template-columns: 40px 1fr;
            gap: 14px;
            padding: 26px 0;
          }
          .upside-chip {
            grid-column: 2;
            justify-self: start;
            margin-top: 12px;
          }
          .upside-text {
            max-width: none;
          }
          .proof-dark {
            padding: 56px 0 130px;
          }
          .proof-item-a {
            margin-top: -108px;
          }
          .proof-meta {
            padding: 0 2px;
          }
          .proof-chips {
            align-items: flex-start;
          }
          .proof-supporting {
            font-size: 1.3rem;
            margin-top: 60px;
          }
          .footer-grid {
            grid-template-columns: 1fr;
            gap: 30px;
          }
          .footer-rule-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
}
