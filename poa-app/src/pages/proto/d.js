import Head from 'next/head';
import { PROTO_COPY } from '@/components/marketing/protoCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';

// Direction D — "The mutual, documented" (HYBRID: C base × A's documentary apparatus).
//
// BASE = Direction C ("The mutual", cooperative-bank modernism): full-bleed evergreen
// #0E2A23 hero with gold accents, the Fraunces / Instrument Sans / Plex Mono stack, the
// 4 / 100% / $0 stat-numeral band, sand bands, evergreen bookends, gold data chips.
//
// GRAFTED FROM Direction A (the judges' favorite device — "turns product shots into
// documentary evidence"): the fig-annotation apparatus on EVERY product screenshot —
// corner registration ticks, a hairline frame + paper mat, a mono figure bar below each
// plate, and absolutely-positioned hairline leader lines with mono labels pointing INTO
// exact UI elements. In C's world these annotations are GOLD (#C9A227 on evergreen,
// #8A6D1C on sand) — not A's orange.
//
// FIXED (verbatim judge criticism of C):
//   (1) "the lavender-headed kanban screenshot clashes with the green/gold ink system and
//       sits smaller than the story it has to carry" → tasks-board plate is now FULL
//       content-width (A's fig 03 treatment) and every screenshot is matted in paper
//       #F2EFE6 with a 1px ink hairline + inner mat, so the purple app chrome reads as a
//       photographed object inside the brand world, not a clash.
//   (2) "dark-on-dark task modal mutes the hero proof" → the hero task card gets the same
//       paper mat so it pops off the evergreen.
//
// Self-contained: plain JSX + styled-jsx only. No Chakra, no theme tokens, no
// framer-motion. Body copy verbatim from PROTO_COPY; direction wording only in mono
// microcopy (figure bars, leader labels, data chips). No em-dashes anywhere (figure
// labels use " · "). All annotation/chip numbers are visible in the actual captures.
//
// Data visible in the captures (verifiability):
//   task-detail.webp : Reward 50 Shares, claimed by emmaphilosopher, EASY, 1H
//   tasks-board.webp : columns Open / In Progress / In Review / Completed;
//                      payouts 5 / 8 / 10 / 15 / 40 / 50 Shares
//   treasury.webp    : Profit Share #4 / #3 / #2, 1.00 / 1.00 / 0.50 BREAD, 100% claimed,
//                      3 / 3 / 2 members claimed

const S = PRODUCT_SHOTS;

export default function ProtoD() {
  return (
    <div className="mutual" id="top">
      <Head>
        <title>Poa direction D prototype</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
            @font-face {
              font-family: 'Fraunces D';
              font-style: normal;
              font-weight: 300 700;
              font-display: swap;
              src: url('/fonts/proto/c-fraunces-vf.woff2') format('woff2');
            }
            @font-face {
              font-family: 'Instrument Sans D';
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
            <span className="brand-reg" aria-hidden="true">
              member owned
            </span>
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
      <section className="hero">
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

          {/* Hero spec plate: the task payout card, matted in paper + annotated in gold. */}
          <div className="hero-panel poa-rise" style={{ animationDelay: '0.14s' }}>
            <figure className="plate plate-hero">
              <span className="tick tick-tl" aria-hidden="true" />
              <span className="tick tick-tr" aria-hidden="true" />
              <span className="tick tick-bl" aria-hidden="true" />
              <span className="tick tick-br" aria-hidden="true" />
              <div className="plate-mat">
                <div className="plate-frame">
                  <img
                    src={S.taskDetail.src}
                    width={S.taskDetail.width / 2}
                    height={S.taskDetail.height / 2}
                    alt={S.taskDetail.alt}
                    className="plate-img"
                  />
                </div>
              </div>
              {/* leader line: label -> leader -> dot, pointing into the "50 Shares" reward */}
              <div className="anno anno-hero" aria-hidden="true">
                <span className="anno-label">work approved · 50 shares issued</span>
                <span className="anno-leader anno-leader-down" />
                <span className="anno-dot" />
              </div>
              <figcaption className="figbar">
                <span className="figbar-id">fig 01</span>
                <span className="figbar-txt">
                  {S.taskDetail.org} · one completed task · reward 50 shares,
                  claimed by emmaphilosopher
                </span>
              </figcaption>
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
            <p className="kicker">
              <span className="kicker-no">01</span>
              {PROTO_COPY.pain.kicker}
            </p>
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

      {/* ───────────────────────── PRODUCT PROOF ───────────────────────── */}
      <section className="proof">
        {/* Evergreen header floor; the wide tasks-board plate straddles the seam onto sand. */}
        <div className="proof-dark">
          <div className="wrap">
            <div className="sec-head proof-head">
              <span className="gold-rule" aria-hidden="true" />
              <p className="kicker kicker-on-dark">
                <span className="kicker-no kicker-no-dark">02</span>
                {PROTO_COPY.proof.kicker}
              </p>
              <h2 className="sec-title sec-title-on-dark">{PROTO_COPY.proof.heading}</h2>
            </div>
          </div>
        </div>

        <div className="proof-light">
          <div className="wrap">
            {/* PLATE 1 — tasks board, FULL content-width (fig 03 treatment), matted. */}
            <figure className="plate plate-wide proof-wide">
              <span className="tick tick-tl tick-sand" aria-hidden="true" />
              <span className="tick tick-tr tick-sand" aria-hidden="true" />
              <span className="tick tick-bl tick-sand" aria-hidden="true" />
              <span className="tick tick-br tick-sand" aria-hidden="true" />
              <div className="plate-mat plate-mat-sand">
                <div className="plate-frame plate-frame-sand">
                  <img
                    src={S.tasksBoard.src}
                    width={S.tasksBoard.width / 2}
                    height={S.tasksBoard.height / 2}
                    alt={S.tasksBoard.alt}
                    className="plate-img"
                  />
                </div>
              </div>
              {/* leader into the Completed column's bottom card ("50 Shares · completed"):
                  label sits right of the board, leader points left into the reward */}
              <div className="anno anno-board" aria-hidden="true">
                <span className="anno-dot anno-dot-sand" />
                <span className="anno-leader anno-leader-sand" />
                <span className="anno-label anno-label-sand">
                  paid on approval · 50 shares
                </span>
              </div>
              <figcaption className="figbar figbar-sand">
                <span className="figbar-id figbar-id-sand">fig 02</span>
                <span className="figbar-txt">
                  {S.tasksBoard.org} · shared task board · payouts of 5 to 50
                  shares, posted in the open
                </span>
              </figcaption>
            </figure>

            <p className="proof-caption-line">
              {PROTO_COPY.proof.shots[0].caption}
            </p>

            {/* PLATE 2 — treasury distributions, matted, annotated into "3 members claimed". */}
            <div className="proof-split">
              <figure className="plate plate-tall proof-tall">
                <span className="tick tick-tl tick-sand" aria-hidden="true" />
                <span className="tick tick-tr tick-sand" aria-hidden="true" />
                <span className="tick tick-bl tick-sand" aria-hidden="true" />
                <span className="tick tick-br tick-sand" aria-hidden="true" />
                <div className="plate-mat plate-mat-sand">
                  <div className="plate-frame plate-frame-sand">
                    <img
                      src={S.treasury.src}
                      width={S.treasury.width / 2}
                      height={S.treasury.height / 2}
                      alt={S.treasury.alt}
                      className="plate-img"
                    />
                  </div>
                </div>
                {/* dot on the "3 members claimed" line of Profit Share #4; short leader +
                    label sit in the empty dark body of the same card, to its right */}
                <div className="anno anno-treasury" aria-hidden="true">
                  <span className="anno-dot anno-dot-sand" />
                  <span className="anno-leader anno-leader-sand" />
                  <span className="anno-label anno-label-sand">3 members claimed</span>
                </div>
                <figcaption className="figbar figbar-sand">
                  <span className="figbar-id figbar-id-sand">fig 03</span>
                  <span className="figbar-txt">
                    {S.treasury.org} · active profit shares · every share
                    distributed to the members who earned it
                  </span>
                </figcaption>
              </figure>

              <div className="proof-meta">
                <p className="figtag">fig 03 · the money</p>
                <p className="proof-caption">{PROTO_COPY.proof.shots[1].caption}</p>
                <div className="proof-chips">
                  <span className="chip chip-sand-gold">profit share #4 · 100% claimed</span>
                  <span className="chip chip-sand">1.00 bread · 3 members claimed</span>
                  <span className="chip chip-sand">profit share #2 · 0.50 bread</span>
                </div>
              </div>
            </div>

            <p className="proof-supporting">
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
          --serif: 'Fraunces D', 'Fraunces', Georgia, serif;
          --sans: 'Instrument Sans D', 'Instrument Sans', -apple-system,
            'Segoe UI', system-ui, sans-serif;
          --mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;

          font-family: var(--sans);
          color: var(--ink);
          background: var(--sand);
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
          overflow-x: hidden;
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
          align-items: baseline;
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
          align-self: center;
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
        .brand-reg {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(242, 239, 230, 0.5);
          margin-left: 2px;
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
          padding: 64px 0 0;
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
          grid-template-columns: 1.02fr 1fr;
          gap: 52px;
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
          margin: 0 0 20px;
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
          font-size: clamp(2.75rem, 6vw, 4.9rem);
          line-height: 0.98;
          letter-spacing: -0.018em;
          margin: 0 0 22px;
          color: #fbf9f2;
        }
        .hero-title-em {
          font-style: italic;
          font-variation-settings: 'opsz' 144, 'wght' 500, 'SOFT' 60;
          color: var(--gold);
        }
        .hero-sub {
          font-size: 17.5px;
          line-height: 1.58;
          color: rgba(242, 239, 230, 0.82);
          max-width: 30em;
          margin: 0 0 26px;
        }
        .hero-cta {
          display: flex;
          gap: 14px;
          margin: 0 0 20px;
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
        .hero-chips {
          margin-top: 18px;
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
          margin-top: 52px;
          padding: 24px 0 28px;
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
          font-size: 40px;
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

        /* ======================================================================
           DOCUMENTARY SPEC PLATE (grafted from Direction A, re-inked to C's gold)
           ====================================================================== */
        .plate {
          position: relative;
          margin: 0;
          padding: 13px;
        }
        /* paper mat + ink hairline: makes the app chrome read as a photographed object */
        .plate-mat {
          background: var(--paper-dark);
          border: 1px solid rgba(14, 42, 35, 0.5);
          padding: 8px;
          box-shadow: 0 2px 6px rgba(14, 42, 35, 0.14),
            0 24px 64px rgba(14, 42, 35, 0.34);
        }
        .plate-mat-sand {
          border-color: var(--ink);
          box-shadow: 0 2px 6px rgba(14, 42, 35, 0.1),
            0 22px 56px rgba(14, 42, 35, 0.18);
        }
        .plate-frame {
          border: 1px solid rgba(14, 42, 35, 0.55);
          overflow: hidden;
          background: #0c0a12;
          line-height: 0;
        }
        .plate-frame-sand {
          border-color: var(--ink);
        }
        .plate-img {
          display: block;
          width: 100%;
          height: auto;
        }

        /* corner registration ticks (gold) */
        .tick {
          position: absolute;
          width: 12px;
          height: 12px;
          z-index: 2;
        }
        .tick::before,
        .tick::after {
          content: '';
          position: absolute;
          background: var(--gold);
        }
        .tick::before {
          width: 12px;
          height: 1.5px;
          top: 5px;
        }
        .tick::after {
          width: 1.5px;
          height: 12px;
          left: 5px;
        }
        .tick-sand::before,
        .tick-sand::after {
          background: var(--gold-deep);
        }
        .tick-tl {
          top: 0;
          left: 0;
        }
        .tick-tr {
          top: 0;
          right: 0;
        }
        .tick-bl {
          bottom: 0;
          left: 0;
        }
        .tick-br {
          bottom: 0;
          right: 0;
        }

        /* figure bar (mono caption under the plate) */
        .figbar {
          display: flex;
          gap: 14px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--hairline-dark);
          font-family: var(--mono);
          font-size: 11.5px;
          line-height: 1.5;
          letter-spacing: 0.01em;
          color: rgba(242, 239, 230, 0.66);
        }
        .figbar-id {
          color: var(--gold);
          flex: none;
          font-weight: 500;
        }
        .figbar-txt {
          text-transform: none;
        }
        .figbar-sand {
          border-top-color: rgba(20, 35, 30, 0.16);
          color: var(--ink-soft);
        }
        .figbar-id-sand {
          color: var(--gold-deep);
        }

        /* annotation leader lines (gold) */
        .anno {
          position: absolute;
          display: flex;
          align-items: center;
          z-index: 3;
          pointer-events: none;
        }
        .anno-label {
          font-family: var(--mono);
          font-size: 10.5px;
          letter-spacing: 0.01em;
          color: #23200f;
          background: var(--gold);
          padding: 3px 8px;
          white-space: nowrap;
          line-height: 1.3;
          box-shadow: 0 2px 8px rgba(14, 42, 35, 0.3);
        }
        .anno-label-sand {
          background: var(--gold-deep);
          color: #fbf9f2;
          box-shadow: 0 2px 8px rgba(14, 42, 35, 0.18);
        }
        .anno-leader {
          height: 1.5px;
          width: 34px;
          background: var(--gold);
          flex: none;
        }
        .anno-leader-sand {
          background: var(--gold-deep);
        }
        .anno-leader-down {
          width: 1.5px;
          height: 42px;
        }
        .anno-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1.5px solid var(--gold);
          background: transparent;
          flex: none;
        }
        .anno-dot-sand {
          border-color: var(--gold-deep);
        }

        /* hero plate: leader drops from the label down into the "50 Shares" reward box,
           which sits lower-left in the task-detail capture */
        .plate-hero {
          transform: rotate(0.35deg);
        }
        .anno-hero {
          left: 16%;
          bottom: 92px;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
        }
        .anno-hero .anno-leader-down {
          margin-left: 24px;
        }

        /* tasks-board plate: label sits over the empty In Review column, leader runs right
           into the "50 Shares" reward on the bottom card of the Completed column */
        .anno-board {
          left: 52%;
          top: 60%;
          flex-direction: row-reverse;
          align-items: center;
        }
        .anno-board .anno-leader {
          width: 118px;
        }

        /* treasury plate: dot sits on the "3 members claimed" line of Profit Share #4,
           short leader + label sit in the empty dark body of that same card */
        .anno-treasury {
          left: 27%;
          top: 33.5%;
          flex-direction: row;
        }
        .anno-treasury .anno-leader {
          width: 22px;
        }

        /* ---------- section shared ---------- */
        .band {
          padding: 92px 0;
        }
        .band-sand {
          background: var(--sand);
        }
        .sec-head {
          max-width: 660px;
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
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .kicker-no {
          font-size: 12px;
          color: var(--paper-dark);
          background: var(--ink);
          padding: 3px 7px;
          letter-spacing: 0.06em;
          border-radius: 3px;
        }
        .kicker-on-dark {
          color: var(--gold);
        }
        .kicker-no-dark {
          background: var(--gold);
          color: #23200f;
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

        /* ---------- product proof ---------- */
        .proof {
          position: relative;
        }
        .proof-dark {
          background: var(--evergreen);
          padding: 88px 0 200px;
        }
        .proof-head {
          max-width: 720px;
        }
        .proof-light {
          background: var(--sand);
          padding: 0 0 96px;
        }
        /* wide plate straddles the dark/light seam (C's overlap move, A's fig-03 scale) */
        .proof-wide {
          margin-top: -168px;
        }
        .proof-caption-line {
          font-family: var(--serif);
          font-variation-settings: 'opsz' 60, 'wght' 480, 'SOFT' 50;
          font-size: 21px;
          line-height: 1.32;
          letter-spacing: -0.005em;
          color: var(--ink);
          margin: 30px 0 0;
          max-width: 46ch;
        }
        .proof-split {
          display: grid;
          grid-template-columns: 1fr 0.86fr;
          gap: 44px;
          align-items: center;
          margin-top: 72px;
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
          max-width: 720px;
          margin: 88px auto 0;
          font-family: var(--serif);
          font-variation-settings: 'opsz' 72, 'wght' 460, 'SOFT' 50;
          font-size: clamp(1.35rem, 2.4vw, 1.85rem);
          line-height: 1.32;
          letter-spacing: -0.01em;
          color: var(--ink);
          text-align: center;
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
            gap: 40px;
          }
          .hero-panel {
            max-width: 520px;
          }
          .proof-split {
            grid-template-columns: 1fr;
            gap: 28px;
          }
        }

        @media (max-width: 620px) {
          .wrap {
            padding: 0 20px;
          }
          .nav-links,
          .nav-signin,
          .brand-reg {
            display: none;
          }
          .nav {
            height: 62px;
            gap: 12px;
          }
          .hero {
            padding: 40px 0 0;
          }
          .hero-title {
            font-size: clamp(2.5rem, 12vw, 3.4rem);
          }
          .hero-sub {
            font-size: 16.5px;
          }
          .hero-cta .btn {
            flex: 1 1 auto;
          }
          .hero-panel {
            max-width: none;
            margin-bottom: 26px;
          }
          .plate {
            padding: 10px;
          }
          .hero-chips {
            flex-direction: row;
            flex-wrap: wrap;
            margin-top: 18px;
          }
          .chip {
            font-size: 11px;
            padding: 6px 10px;
          }
          .hero-ledger {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
            margin-top: 42px;
          }
          .ledger-div {
            display: none;
          }
          .ledger-num {
            font-size: 34px;
          }
          .ledger-label {
            max-width: none;
          }
          .band {
            padding: 60px 0;
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
            padding: 54px 0 130px;
          }
          .proof-wide {
            margin-top: -108px;
          }
          .proof-caption-line,
          .proof-caption {
            font-size: 18px;
            max-width: none;
          }
          .proof-split {
            margin-top: 44px;
          }
          .proof-chips {
            align-items: flex-start;
          }
          .proof-supporting {
            font-size: 1.3rem;
            margin-top: 56px;
          }
          /* annotations are tight on a phone — hide the floating callouts; the figure
             bars carry the same numbers in-flow */
          .anno {
            display: none;
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
