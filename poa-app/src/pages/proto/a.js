import Head from 'next/head';
import { PROTO_COPY } from '@/components/marketing/protoCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';

// Direction A — "Public works" (civic standards-manual modernism).
// NASA Graphics Standards Manual (1975) / Swiss federal signage / USWDS + Public Sans.
// Self-contained: plain HTML + styled-jsx only. No Chakra, no theme tokens, no
// framer-motion. Body copy is rendered verbatim from PROTO_COPY; the only
// direction-specific wording lives in mono microcopy (figure bars, register
// markers, annotation leader labels), all vocab-clean.

const C = PROTO_COPY;
const S = PRODUCT_SHOTS;

export default function ProtoA() {
  return (
    <>
      <Head>
        <title>Poa — public works prototype</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="pa-root">
        {/* ============================ NAV ============================ */}
        <header className="pa-nav">
          <div className="pa-container pa-nav-inner">
            <a className="pa-brand" href="#top">
              <span className="pa-brand-mark">Poa</span>
              <span className="pa-brand-reg">reg. no. 001</span>
            </a>
            <nav className="pa-nav-links">
              {C.nav.links.map((l) => (
                <a key={l} href="#" className="pa-nav-link">
                  {l}
                </a>
              ))}
            </nav>
            <div className="pa-nav-actions">
              <a href="#" className="pa-signin">
                {C.nav.signIn}
              </a>
              <a href="#" className="pa-cta-solid">
                {C.nav.cta}
              </a>
            </div>
          </div>
        </header>

        <div className="pa-hairline" />

        {/* ============================ HERO ============================ */}
        <section className="pa-section pa-hero" id="top">
          <div className="pa-container pa-grid">
            <span className="pa-rail" aria-hidden="true">
              sec 00 / hero
            </span>

            <div className="pa-hero-text poa-fade">
              <p className="pa-eyebrow">
                <span className="pa-eyebrow-tick">§</span>
                {C.hero.eyebrow}
              </p>
              <h1 className="pa-h1">{C.hero.headline}</h1>
              <p className="pa-subline">{C.hero.subline}</p>
              <div className="pa-cta-row">
                <a href="#" className="pa-cta-solid pa-cta-lg">
                  {C.hero.ctaPrimary}
                </a>
                <a href="#" className="pa-cta-ghost">
                  {C.hero.ctaSecondary}
                  <span className="pa-arrow">→</span>
                </a>
              </div>
              <p className="pa-quiet">
                <span className="pa-quiet-bar" aria-hidden="true" />
                {C.hero.quiet}
              </p>
            </div>

            {/* Hero spec plate: the task-detail payout card, annotated. */}
            <figure className="pa-hero-plate poa-rise">
              <div className="pa-plate">
                <span className="pa-tick pa-tick-tl" aria-hidden="true" />
                <span className="pa-tick pa-tick-tr" aria-hidden="true" />
                <span className="pa-tick pa-tick-bl" aria-hidden="true" />
                <span className="pa-tick pa-tick-br" aria-hidden="true" />
                <div className="pa-plate-mat">
                  <div className="pa-plate-frame">
                    <img
                      src={S.taskDetail.src}
                      width={S.taskDetail.width / 2}
                      height={S.taskDetail.height / 2}
                      alt={S.taskDetail.alt}
                      className="pa-plate-img"
                    />
                  </div>
                </div>
                {/* annotation leader line pointing into the reward figure */}
                <div className="pa-anno pa-anno-hero" aria-hidden="true">
                  <span className="pa-anno-label">
                    fig 00 — work approved, ownership issued
                  </span>
                  <span className="pa-anno-leader" />
                  <span className="pa-anno-dot" />
                </div>
              </div>
              <figcaption className="pa-figbar">
                <span className="pa-figbar-id">fig 00</span>
                <span className="pa-figbar-txt">
                  {S.taskDetail.org} · one completed task · reward 50 shares,
                  claimed by emmaphilosopher
                </span>
              </figcaption>
            </figure>
          </div>
        </section>

        <div className="pa-hairline" />

        {/* ==================== PAIN / THE UPSIDE ==================== */}
        <section className="pa-section pa-pain">
          <div className="pa-container pa-grid">
            <span className="pa-rail" aria-hidden="true">
              sec 01 / {C.pain.kicker.toLowerCase()}
            </span>

            <div className="pa-pain-head poa-reveal">
              <p className="pa-kicker">
                <span className="pa-kicker-no">01</span>
                {C.pain.kicker}
              </p>
              <h2 className="pa-h2">{C.pain.heading}</h2>
              <p className="pa-lead">{C.pain.lead}</p>
            </div>

            <ol className="pa-items poa-reveal">
              {C.pain.items.map((it, i) => (
                <li key={it.title} className="pa-item">
                  <span className="pa-item-no">{String(i + 1).padStart(2, '0')}</span>
                  <div className="pa-item-body">
                    <h3 className="pa-item-title">{it.title}</h3>
                    <p className="pa-item-text">{it.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="pa-hairline" />

        {/* ==================== CIVIC FULL-BLEED BAND ==================== */}
        {/* The one #10243E band: dark-plate treasury screenshot in bone. */}
        <section className="pa-section pa-band">
          <div className="pa-container pa-grid pa-grid-band">
            <span className="pa-rail pa-rail-band" aria-hidden="true">
              sec 02 / the money
            </span>

            <div className="pa-band-text poa-reveal">
              <p className="pa-kicker pa-kicker-inv">
                <span className="pa-kicker-no pa-kicker-no-inv">02</span>
                {C.proof.kicker}
              </p>
              <h2 className="pa-h2 pa-h2-inv">
                {C.proof.shots[1].caption}
              </h2>
              <p className="pa-lead pa-lead-inv">{C.proof.supporting}</p>
              <dl className="pa-stats">
                <div className="pa-stat">
                  <dt className="pa-stat-k">distributed</dt>
                  <dd className="pa-stat-v">3 profit shares</dd>
                </div>
                <div className="pa-stat">
                  <dt className="pa-stat-k">claimed</dt>
                  <dd className="pa-stat-v">100%</dd>
                </div>
                <div className="pa-stat">
                  <dt className="pa-stat-k">held by Poa</dt>
                  <dd className="pa-stat-v">0</dd>
                </div>
              </dl>
            </div>

            <figure className="pa-band-plate poa-reveal">
              <div className="pa-plate pa-plate-onnavy">
                <span className="pa-tick pa-tick-tl pa-tick-inv" aria-hidden="true" />
                <span className="pa-tick pa-tick-tr pa-tick-inv" aria-hidden="true" />
                <span className="pa-tick pa-tick-bl pa-tick-inv" aria-hidden="true" />
                <span className="pa-tick pa-tick-br pa-tick-inv" aria-hidden="true" />
                <div className="pa-plate-mat pa-plate-mat-bone">
                  <div className="pa-plate-frame pa-plate-frame-inv">
                    <img
                      src={S.treasury.src}
                      width={S.treasury.width / 2}
                      height={S.treasury.height / 2}
                      alt={S.treasury.alt}
                      className="pa-plate-img"
                    />
                  </div>
                </div>
                <div className="pa-anno pa-anno-band" aria-hidden="true">
                  <span className="pa-anno-dot pa-anno-dot-inv" />
                  <span className="pa-anno-leader pa-anno-leader-inv" />
                  <span className="pa-anno-label pa-anno-label-inv">
                    split by earned share, 100% claimed
                  </span>
                </div>
              </div>
              <figcaption className="pa-figbar pa-figbar-inv">
                <span className="pa-figbar-id pa-figbar-id-inv">fig 02</span>
                <span className="pa-figbar-txt pa-figbar-txt-inv">
                  {S.treasury.org} · active profit shares · every share
                  distributed to the members who earned it
                </span>
              </figcaption>
            </figure>
          </div>
        </section>

        <div className="pa-hairline" />

        {/* ==================== PRODUCT PROOF ==================== */}
        <section className="pa-section pa-proof">
          <div className="pa-container pa-grid">
            <span className="pa-rail" aria-hidden="true">
              sec 03 / {C.proof.kicker.toLowerCase()}
            </span>

            <div className="pa-proof-head poa-reveal">
              <p className="pa-kicker">
                <span className="pa-kicker-no">03</span>
                {C.proof.kicker}
              </p>
              <h2 className="pa-h2">{C.proof.heading}</h2>
              <p className="pa-lead">{C.proof.shots[0].caption}</p>
            </div>

            <figure className="pa-proof-plate poa-reveal">
              <div className="pa-plate pa-plate-wide">
                <span className="pa-tick pa-tick-tl" aria-hidden="true" />
                <span className="pa-tick pa-tick-tr" aria-hidden="true" />
                <span className="pa-tick pa-tick-bl" aria-hidden="true" />
                <span className="pa-tick pa-tick-br" aria-hidden="true" />
                <div className="pa-plate-mat">
                  <div className="pa-plate-frame">
                    <img
                      src={S.tasksBoard.src}
                      width={S.tasksBoard.width / 2}
                      height={S.tasksBoard.height / 2}
                      alt={S.tasksBoard.alt}
                      className="pa-plate-img"
                    />
                  </div>
                </div>
                <div className="pa-anno pa-anno-proof" aria-hidden="true">
                  <span className="pa-anno-label">
                    each column is a stage: open, in progress, in review, paid
                  </span>
                  <span className="pa-anno-leader pa-anno-leader-down" />
                  <span className="pa-anno-dot" />
                </div>
              </div>
              <figcaption className="pa-figbar">
                <span className="pa-figbar-id">fig 03</span>
                <span className="pa-figbar-txt">
                  {S.tasksBoard.org} · shared task board · payouts of 5 to 50
                  shares, posted in the open
                </span>
              </figcaption>
            </figure>

            <p className="pa-supporting poa-reveal">
              <span className="pa-supporting-mark" aria-hidden="true" />
              {C.proof.supporting}
            </p>
          </div>
        </section>

        <div className="pa-hairline" />

        {/* ============================ FOOTER ============================ */}
        <footer className="pa-footer">
          <div className="pa-container pa-grid pa-grid-footer">
            <span className="pa-rail" aria-hidden="true">
              colophon
            </span>
            <div className="pa-footer-brand">
              <span className="pa-brand-mark pa-brand-mark-lg">Poa</span>
              <p className="pa-footer-tag">{C.footer.tagline}</p>
              <p className="pa-footer-self">{C.footer.selfHost}</p>
            </div>
            <div className="pa-footer-cols">
              <nav className="pa-footer-nav">
                {C.footer.links.map((l) => (
                  <a key={l} href="#" className="pa-footer-link">
                    {l}
                  </a>
                ))}
              </nav>
              <p className="pa-footer-fine">
                <span className="pa-footer-fine-id">std. 001</span>
                Poa graphics standard · public works edition · sheet a
              </p>
            </div>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        /* Prototype-scoped fonts. Declared here (not globals) so app routes never
           download them. Variable fonts — driven with font-variation-settings. */
        @font-face {
          font-family: 'ProtoArchivo';
          src: url('/fonts/proto/a-archivo-vf.woff2') format('woff2');
          font-weight: 100 900;
          font-display: swap;
        }
        @font-face {
          font-family: 'ProtoPublicSans';
          src: url('/fonts/proto/a-public-sans-vf.woff2') format('woff2');
          font-weight: 100 900;
          font-display: swap;
        }
      `}</style>

      <style jsx>{`
        /* -------------------- palette + type -------------------- */
        .pa-root {
          --bone: #f7f6f2;
          --ink: #16181d;
          --steel: #4a4f58;
          --civic: #10243e;
          --signal: #b45309;
          --signal-deep: #7c2d12;
          --hair: #d8d5cc;
          --hair-inv: rgba(247, 246, 242, 0.22);
          --rail: 72px;
          --archivo: 'ProtoArchivo', 'Archivo', system-ui, sans-serif;
          --sans: 'ProtoPublicSans', 'Public Sans', system-ui, sans-serif;
          --mono: 'IBM Plex Mono', 'Fira Code', ui-monospace, monospace;

          background: var(--bone);
          color: var(--ink);
          font-family: var(--sans);
          font-size: 17px;
          line-height: 1.65;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }
        .pa-root :global(*) {
          box-sizing: border-box;
        }

        .pa-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 32px;
          width: 100%;
        }

        .pa-hairline {
          height: 1px;
          background: var(--hair);
          width: 100%;
        }

        /* asymmetric 12-col grid w/ fixed left rail */
        .pa-grid {
          display: grid;
          grid-template-columns: var(--rail) repeat(12, 1fr);
          column-gap: 24px;
          align-items: start;
        }

        .pa-rail {
          grid-column: 1 / 2;
          position: sticky;
          top: 96px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--signal-deep);
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          white-space: nowrap;
          padding-top: 6px;
          align-self: start;
        }
        .pa-rail-band {
          color: var(--signal);
        }

        /* -------------------- nav -------------------- */
        .pa-nav {
          position: sticky;
          top: 0;
          z-index: 20;
          background: rgba(247, 246, 242, 0.92);
          border-bottom: 1px solid transparent;
        }
        .pa-nav-inner {
          display: flex;
          align-items: center;
          gap: 32px;
          height: 64px;
        }
        .pa-brand {
          display: flex;
          align-items: baseline;
          gap: 10px;
          text-decoration: none;
          color: var(--ink);
        }
        .pa-brand-mark {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 720;
          font-size: 22px;
          letter-spacing: -0.02em;
          line-height: 1;
        }
        .pa-brand-mark-lg {
          font-size: 44px;
        }
        .pa-brand-reg {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--steel);
        }
        .pa-nav-links {
          display: flex;
          gap: 26px;
          margin-left: 12px;
        }
        .pa-nav-link {
          font-size: 14px;
          color: var(--steel);
          text-decoration: none;
          letter-spacing: 0.01em;
        }
        .pa-nav-link:hover {
          color: var(--ink);
        }
        .pa-nav-actions {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .pa-signin {
          font-size: 14px;
          color: var(--ink);
          text-decoration: none;
        }
        .pa-cta-solid {
          display: inline-flex;
          align-items: center;
          background: var(--ink);
          color: var(--bone);
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          padding: 9px 18px;
          border-radius: 2px;
          letter-spacing: 0.005em;
          transition: background 0.15s ease;
        }
        .pa-cta-solid:hover {
          background: var(--civic);
        }
        .pa-cta-lg {
          font-size: 15px;
          padding: 14px 26px;
        }

        /* -------------------- section base -------------------- */
        .pa-section {
          padding: 92px 0;
        }
        .pa-hero {
          padding: 72px 0 84px;
        }

        /* -------------------- hero -------------------- */
        .pa-hero-text {
          grid-column: 2 / 8;
          padding-top: 8px;
        }
        .pa-eyebrow {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--signal-deep);
          margin: 0 0 22px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pa-eyebrow-tick {
          color: var(--signal);
          font-size: 14px;
        }
        .pa-h1 {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 640;
          font-size: clamp(2.9rem, 7vw, 5.5rem);
          line-height: 0.98;
          letter-spacing: -0.025em;
          margin: 0 0 26px;
          color: var(--ink);
          max-width: 12ch;
        }
        .pa-subline {
          font-size: 19px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0 0 34px;
          max-width: 46ch;
        }
        .pa-cta-row {
          display: flex;
          align-items: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .pa-cta-ghost {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          color: var(--signal-deep);
          text-decoration: none;
          border-bottom: 1px solid var(--signal);
          padding-bottom: 2px;
        }
        .pa-arrow {
          font-family: var(--mono);
        }
        .pa-quiet {
          margin: 40px 0 0;
          font-family: var(--mono);
          font-size: 12.5px;
          letter-spacing: 0.02em;
          color: var(--steel);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .pa-quiet-bar {
          display: inline-block;
          width: 26px;
          height: 1px;
          background: var(--signal);
          flex: none;
        }

        .pa-hero-plate {
          grid-column: 8 / 14;
          align-self: start;
          margin-top: 4px;
        }

        /* -------------------- spec plate -------------------- */
        .pa-plate {
          position: relative;
          padding: 14px;
        }
        .pa-plate-mat {
          background: var(--bone);
          border: 1px solid var(--ink);
          padding: 8px;
        }
        .pa-plate-mat-bone {
          background: var(--bone);
        }
        .pa-plate-frame {
          border: 1px solid var(--ink);
          overflow: hidden;
          background: #0d0f14;
          line-height: 0;
        }
        .pa-plate-frame-inv {
          border-color: var(--ink);
        }
        .pa-plate-img {
          display: block;
          width: 100%;
          height: auto;
        }

        /* corner registration ticks */
        .pa-tick {
          position: absolute;
          width: 11px;
          height: 11px;
          z-index: 2;
        }
        .pa-tick::before,
        .pa-tick::after {
          content: '';
          position: absolute;
          background: var(--signal);
        }
        .pa-tick::before {
          width: 11px;
          height: 1px;
          top: 5px;
        }
        .pa-tick::after {
          width: 1px;
          height: 11px;
          left: 5px;
        }
        .pa-tick-tl {
          top: 0;
          left: 0;
        }
        .pa-tick-tr {
          top: 0;
          right: 0;
        }
        .pa-tick-bl {
          bottom: 0;
          left: 0;
        }
        .pa-tick-br {
          bottom: 0;
          right: 0;
        }
        .pa-tick-inv::before,
        .pa-tick-inv::after {
          background: var(--signal);
        }

        /* figure bar (mono caption) */
        .pa-figbar {
          display: flex;
          gap: 14px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--hair);
          font-family: var(--mono);
          font-size: 11.5px;
          line-height: 1.5;
          letter-spacing: 0.01em;
          color: var(--steel);
        }
        .pa-figbar-id {
          color: var(--signal-deep);
          flex: none;
          font-weight: 500;
        }
        .pa-figbar-txt {
          text-transform: none;
        }
        .pa-figbar-inv {
          border-top-color: var(--hair-inv);
          color: rgba(247, 246, 242, 0.7);
        }
        .pa-figbar-id-inv {
          color: var(--signal);
        }
        .pa-figbar-txt-inv {
          color: rgba(247, 246, 242, 0.78);
        }

        /* -------------------- annotation leader lines -------------------- */
        .pa-anno {
          position: absolute;
          display: flex;
          align-items: center;
          z-index: 3;
          pointer-events: none;
        }
        .pa-anno-label {
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.01em;
          color: var(--ink);
          background: var(--signal);
          padding: 3px 8px;
          white-space: nowrap;
          line-height: 1.3;
        }
        .pa-anno-label-inv {
          background: var(--signal);
          color: var(--ink);
        }
        .pa-anno-leader {
          height: 1px;
          width: 34px;
          background: var(--signal);
          flex: none;
        }
        .pa-anno-leader-inv {
          background: var(--signal);
        }
        .pa-anno-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          border: 1.5px solid var(--signal);
          background: transparent;
          flex: none;
        }
        .pa-anno-dot-inv {
          border-color: var(--signal);
        }
        /* hero anno: right edge, label -> leader -> dot pointing into reward */
        .pa-anno-hero {
          right: -8px;
          bottom: 74px;
          flex-direction: row-reverse;
        }
        /* sits in the empty quadrant right of Profit Share #2, leader pointing
           left into the 0.50 BREAD pool figure */
        .pa-anno-band {
          left: 47%;
          bottom: 150px;
        }
        .pa-anno-proof {
          left: 3%;
          top: -6px;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
        }
        .pa-anno-leader-down {
          width: 1px;
          height: 58px;
          margin-left: 30px;
        }

        /* -------------------- kickers / headings -------------------- */
        .pa-kicker {
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--signal-deep);
          margin: 0 0 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .pa-kicker-no {
          font-size: 12px;
          color: var(--bone);
          background: var(--ink);
          padding: 3px 7px;
          letter-spacing: 0.06em;
        }
        .pa-kicker-inv {
          color: var(--signal);
        }
        .pa-kicker-no-inv {
          background: var(--signal);
          color: var(--civic);
        }
        .pa-h2 {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 620;
          font-size: clamp(2rem, 4.2vw, 3.2rem);
          line-height: 1.02;
          letter-spacing: -0.022em;
          margin: 0 0 22px;
          max-width: 16ch;
        }
        .pa-h2-inv {
          color: var(--bone);
        }
        .pa-lead {
          font-size: 18px;
          line-height: 1.6;
          color: var(--steel);
          margin: 0;
          max-width: 42ch;
        }
        .pa-lead-inv {
          color: rgba(247, 246, 242, 0.82);
        }

        /* -------------------- pain items -------------------- */
        .pa-pain-head {
          grid-column: 2 / 8;
        }
        .pa-items {
          grid-column: 8 / 14;
          list-style: none;
          margin: 6px 0 0;
          padding: 0;
        }
        .pa-item {
          display: flex;
          gap: 20px;
          padding: 22px 0;
          border-top: 1px solid var(--hair);
        }
        .pa-item:first-child {
          border-top: none;
          padding-top: 0;
        }
        .pa-item-no {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--signal);
          padding-top: 3px;
          flex: none;
          width: 26px;
        }
        .pa-item-title {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 600;
          font-size: 20px;
          letter-spacing: -0.01em;
          margin: 0 0 6px;
          color: var(--ink);
        }
        .pa-item-text {
          font-size: 16px;
          line-height: 1.55;
          color: var(--steel);
          margin: 0;
          max-width: 46ch;
        }

        /* -------------------- civic band -------------------- */
        .pa-band {
          background: var(--civic);
          padding: 96px 0;
        }
        .pa-grid-band {
          align-items: center;
        }
        .pa-band-text {
          grid-column: 2 / 7;
        }
        .pa-stats {
          display: flex;
          gap: 34px;
          margin: 34px 0 0;
          padding-top: 24px;
          border-top: 1px solid var(--hair-inv);
        }
        .pa-stat {
          margin: 0;
        }
        .pa-stat-k {
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--signal);
          margin: 0 0 6px;
        }
        .pa-stat-v {
          font-family: var(--archivo);
          font-variation-settings: 'wght' 620;
          font-size: 24px;
          letter-spacing: -0.01em;
          color: var(--bone);
          margin: 0;
        }
        .pa-band-plate {
          grid-column: 8 / 14;
        }
        .pa-plate-onnavy .pa-plate-mat {
          border-color: var(--hair-inv);
        }

        /* -------------------- product proof -------------------- */
        .pa-proof-head {
          grid-column: 2 / 8;
          margin-bottom: 40px;
        }
        .pa-proof-plate {
          grid-column: 2 / 14;
        }
        .pa-plate-wide .pa-plate-frame {
          background: #17141f;
        }
        .pa-supporting {
          grid-column: 2 / 12;
          margin: 40px 0 0;
          font-family: var(--archivo);
          font-variation-settings: 'wght' 560;
          font-size: clamp(1.3rem, 2.4vw, 1.8rem);
          line-height: 1.28;
          letter-spacing: -0.015em;
          color: var(--ink);
          display: flex;
          align-items: baseline;
          gap: 18px;
          max-width: 30ch;
        }
        .pa-supporting-mark {
          display: inline-block;
          width: 40px;
          height: 3px;
          background: var(--signal);
          flex: none;
          transform: translateY(-6px);
        }

        /* -------------------- footer -------------------- */
        .pa-footer {
          background: var(--ink);
          color: var(--bone);
          padding: 72px 0 40px;
        }
        .pa-grid-footer {
          align-items: start;
        }
        .pa-footer .pa-rail {
          color: var(--signal);
        }
        .pa-footer-brand {
          grid-column: 2 / 8;
        }
        .pa-footer .pa-brand-mark-lg {
          color: var(--bone);
          display: inline-block;
          margin-bottom: 16px;
        }
        .pa-footer-tag {
          font-size: 18px;
          color: var(--bone);
          margin: 0 0 12px;
          max-width: 30ch;
        }
        .pa-footer-self {
          font-size: 14px;
          color: rgba(247, 246, 242, 0.62);
          margin: 0;
          max-width: 40ch;
        }
        .pa-footer-cols {
          grid-column: 9 / 14;
          display: flex;
          flex-direction: column;
          gap: 26px;
          padding-top: 8px;
        }
        .pa-footer-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 16px 26px;
        }
        .pa-footer-link {
          font-size: 14px;
          color: rgba(247, 246, 242, 0.82);
          text-decoration: none;
        }
        .pa-footer-link:hover {
          color: var(--signal);
        }
        .pa-footer-fine {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: rgba(247, 246, 242, 0.5);
          margin: 0;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .pa-footer-fine-id {
          color: var(--signal);
        }

        /* ==================== responsive ==================== */
        @media (max-width: 1080px) {
          .pa-hero-text,
          .pa-pain-head,
          .pa-band-text,
          .pa-proof-head,
          .pa-footer-brand {
            grid-column: 2 / 14;
          }
          .pa-hero-plate,
          .pa-items,
          .pa-band-plate,
          .pa-proof-plate,
          .pa-footer-cols {
            grid-column: 2 / 14;
          }
          .pa-hero-plate {
            margin-top: 48px;
            max-width: 620px;
          }
          .pa-items {
            margin-top: 40px;
          }
          .pa-band-plate {
            margin-top: 44px;
            max-width: 620px;
          }
          .pa-proof-head {
            margin-bottom: 32px;
          }
          .pa-footer-cols {
            margin-top: 40px;
          }
        }

        @media (max-width: 720px) {
          .pa-root {
            --rail: 0px;
            font-size: 16px;
          }
          .pa-container {
            padding: 0 20px;
          }
          .pa-grid {
            grid-template-columns: 1fr;
            column-gap: 0;
          }
          .pa-rail {
            display: none;
          }
          .pa-hero-text,
          .pa-pain-head,
          .pa-hero-plate,
          .pa-items,
          .pa-band-text,
          .pa-band-plate,
          .pa-proof-head,
          .pa-proof-plate,
          .pa-supporting,
          .pa-footer-brand,
          .pa-footer-cols {
            grid-column: 1 / 2;
          }
          .pa-section {
            padding: 56px 0;
          }
          .pa-hero {
            padding: 40px 0 52px;
          }
          .pa-band {
            padding: 60px 0;
          }
          .pa-nav-links {
            display: none;
          }
          .pa-nav-actions .pa-signin {
            display: none;
          }
          .pa-nav-inner {
            gap: 16px;
          }
          .pa-h1 {
            font-size: clamp(2.6rem, 12vw, 3.6rem);
            max-width: 100%;
          }
          .pa-subline {
            font-size: 17px;
          }
          .pa-hero-plate {
            margin-top: 40px;
            max-width: 100%;
          }
          .pa-band-plate {
            max-width: 100%;
          }
          /* annotations are tight on narrow screens — hide the floating callouts,
             the figure bars carry the same information in-flow */
          .pa-anno {
            display: none;
          }
          .pa-stats {
            gap: 20px;
            flex-wrap: wrap;
          }
          .pa-stat-v {
            font-size: 20px;
          }
          .pa-supporting {
            font-size: 1.35rem;
            max-width: 100%;
          }
          .pa-cta-row {
            gap: 16px;
          }
          .pa-cta-solid.pa-cta-lg {
            width: 100%;
            justify-content: center;
          }
          .pa-item-text,
          .pa-lead,
          .pa-subline {
            max-width: 100%;
          }
        }
      `}</style>
    </>
  );
}
