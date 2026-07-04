// Direction B — "The imprint" (institutional editorial; Stripe Press / Works in
// Progress). Self-contained bake-off prototype for the landing redesign (P1).
// Plain HTML + styled-jsx only; no Chakra, no framer-motion, no theme tokens.
// Body copy is imported VERBATIM from the shared control module; the only
// direction-specific wording lives in plate captions, folios, and figure labels.
//
// Palette:  paper #FBF7EF · plate #FFFFFF · ink #1F1B13 · ink-soft #57503F
//           evergreen #1E3D2C · gilt #B08A3E
// Type:     Newsreader Variable (hosted) at display opsz · IBM Plex Mono (hosted)
//           for folios/captions. Zero new font bytes.

import Head from 'next/head';
import { PROTO_COPY } from '@/components/marketing/protoCopy';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';

const C = PROTO_COPY;
const S = PRODUCT_SHOTS;

// Render a product screenshot at half its manifest pixel size (DSF-2 crispness).
function Plate({ shot, folio, caption, figure, wide }) {
  return (
    <figure className={`plate ${wide ? 'plate--wide' : ''}`}>
      <div className="plate__mat">
        <div className="plate__inset">
          <img
            src={shot.src}
            width={Math.round(shot.width / 2)}
            height={Math.round(shot.height / 2)}
            alt={shot.alt}
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
      <figcaption className="plate__cap">
        <span className="plate__folio">{folio}</span>
        <span className="plate__caption">{caption}</span>
        {figure ? <span className="plate__figure">{figure}</span> : null}
      </figcaption>
    </figure>
  );
}

export default function ProtoB() {
  return (
    <>
      <Head>
        <title>Poa — the imprint (proto b)</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="imprint">
        {/* ── nav ─────────────────────────────────────────────────────── */}
        <header className="nav">
          <div className="nav__inner">
            <a className="nav__mark" href="#top">
              <span className="nav__logo">poa</span>
              <span className="nav__rule" aria-hidden="true" />
              <span className="nav__imprint">an imprint of the people in it</span>
            </a>
            <nav className="nav__links">
              {C.nav.links.map((l) => (
                <a key={l} href="#">
                  {l}
                </a>
              ))}
            </nav>
            <div className="nav__actions">
              <a className="nav__signin" href="#">
                {C.nav.signIn}
              </a>
              <a className="nav__cta" href="#">
                {C.nav.cta}
              </a>
            </div>
          </div>
        </header>

        {/* ── hero ────────────────────────────────────────────────────── */}
        <section className="hero" id="top">
          <div className="hero__grid">
            <div className="hero__lede">
              <p className="eyebrow poa-rise">{C.hero.eyebrow}</p>
              <h1 className="hero__title poa-fade">
                Do the work.
                <br />
                Own the <em>upside</em>.
              </h1>
              <p className="hero__sub poa-rise" style={{ animationDelay: '0.08s' }}>
                {C.hero.subline}
              </p>
              <div className="hero__cta poa-rise" style={{ animationDelay: '0.16s' }}>
                <a className="btn btn--solid" href="#">
                  {C.hero.ctaPrimary}
                </a>
                <a className="btn btn--ghost" href="#">
                  {C.hero.ctaSecondary}
                </a>
              </div>
              <p className="hero__quiet poa-rise" style={{ animationDelay: '0.24s' }}>
                {C.hero.quiet}
              </p>
            </div>

            {/* tipped-in hero plate: the task payout card */}
            <div className="hero__plate poa-rise" style={{ animationDelay: '0.12s' }}>
              <Plate
                shot={S.taskDetail}
                wide={false}
                folio="plate i"
                caption="A finished task, approved and paid in ownership."
                figure="reward · 50 shares · claimed by emmaphilosopher"
              />
            </div>
          </div>

          {/* the ledger figure bar — the imprint's colophon of real numbers */}
          <div className="figbar poa-rise" style={{ animationDelay: '0.3s' }}>
            <dl className="figbar__row">
              <div className="fig">
                <dt>ownership earned, not bought</dt>
                <dd>
                  50 <span>shares</span>
                </dd>
              </div>
              <div className="fig">
                <dt>revenue distributed, fully claimed</dt>
                <dd>
                  100<span>%</span>
                </dd>
              </div>
              <div className="fig">
                <dt>the election above, decided by members</dt>
                <dd>
                  1<span>· person · vote</span>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="edge" aria-hidden="true" />

        {/* ── pain / upside ───────────────────────────────────────────── */}
        <section className="upside">
          <span className="folio">i · {C.pain.kicker.toLowerCase()}</span>
          <div className="prose">
            <p className="kicker">{C.pain.kicker}</p>
            <h2 className="upside__head">{C.pain.heading}</h2>
            <p className="lead">{C.pain.lead}</p>
          </div>

          <ol className="terms">
            {C.pain.items.map((it, i) => (
              <li className="term" key={it.title}>
                <span className="term__num">{String(i + 1).padStart(2, '0')}</span>
                <div className="term__body">
                  <h3>{it.title}</h3>
                  <p>{it.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="edge" aria-hidden="true" />

        {/* ── product proof ───────────────────────────────────────────── */}
        <section className="proof">
          <span className="folio">ii · {C.proof.kicker.toLowerCase()}</span>
          <div className="prose">
            <p className="kicker">{C.proof.kicker}</p>
            <h2 className="proof__head">{C.proof.heading}</h2>
          </div>

          <div className="plates">
            <div className="plates__item">
              <Plate
                shot={S.tasksBoard}
                wide
                folio="plate ii"
                caption={C.proof.shots[0].caption}
                figure="initial basement set-up · open · in progress · in review · completed"
              />
            </div>
            <div className="plates__item">
              <Plate
                shot={S.treasury}
                wide
                folio="plate iii"
                caption={C.proof.shots[1].caption}
                figure="profit share #4 · 1.00 bread · 3 members claimed · 100% claimed"
              />
            </div>
          </div>

          <p className="proof__support">{C.proof.supporting}</p>
        </section>

        {/* ── evergreen mission plate ─────────────────────────────────── */}
        <section className="mission">
          <div className="mission__inner">
            <span className="mission__folio">iii · the imprint</span>
            <p className="mission__line">
              The people who do the work <em>own the most</em>.
            </p>
            <p className="mission__sub">{C.footer.selfHost}</p>
          </div>
        </section>

        {/* ── footer ──────────────────────────────────────────────────── */}
        <footer className="foot">
          <div className="foot__inner">
            <div className="foot__brand">
              <span className="foot__logo">poa</span>
              <p className="foot__tag">{C.footer.tagline}</p>
            </div>
            <nav className="foot__links">
              {C.footer.links.map((l) => (
                <a key={l} href="#">
                  {l}
                </a>
              ))}
            </nav>
          </div>
          <div className="foot__colophon">
            <span>first printing</span>
            <span className="foot__colophon-rule" aria-hidden="true" />
            <span>start something that lasts</span>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        /* Scope everything under .imprint so no app route inherits it. */
        .imprint {
          --paper: #fbf7ef;
          --plate: #ffffff;
          --ink: #1f1b13;
          --ink-soft: #57503f;
          --evergreen: #1e3d2c;
          --gilt: #b08a3e;
          --hair: rgba(31, 27, 19, 0.14);
          --lift: 0 1px 2px rgba(31, 27, 19, 0.12), 0 12px 32px rgba(31, 27, 19, 0.08);

          background: var(--paper);
          color: var(--ink);
          font-family: 'Newsreader', Georgia, 'Times New Roman', serif;
          font-optical-sizing: auto;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
          overflow-x: hidden;
        }
        .imprint *,
        .imprint *::before,
        .imprint *::after {
          box-sizing: border-box;
        }
        .imprint a {
          color: inherit;
          text-decoration: none;
        }
        .imprint em {
          font-style: italic;
        }

        /* Paper grain — a hair of warmth, no print-artifact costume. */
        .imprint::before {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background: radial-gradient(
              1200px 600px at 78% -8%,
              rgba(30, 61, 44, 0.05),
              transparent 60%
            ),
            radial-gradient(
              900px 500px at -6% 22%,
              rgba(176, 138, 62, 0.045),
              transparent 55%
            );
        }
        .imprint > * {
          position: relative;
          z-index: 1;
        }

        /* mono utility (folios, captions, figures) */
        .imprint .folio,
        .imprint .plate__folio,
        .imprint .plate__figure,
        .imprint .eyebrow,
        .imprint .kicker,
        .imprint .figbar,
        .imprint .mission__folio,
        .imprint .foot__colophon,
        .imprint .nav__imprint {
          font-family: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace;
        }

        /* ── nav ─────────────────────────────────────────────────────── */
        .imprint .nav {
          border-bottom: 1px solid var(--hair);
          background: rgba(251, 247, 239, 0.86);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .imprint .nav__inner {
          max-width: 1240px;
          margin: 0 auto;
          padding: 18px 40px;
          display: flex;
          align-items: center;
          gap: 32px;
        }
        .imprint .nav__mark {
          display: flex;
          align-items: baseline;
          gap: 14px;
        }
        .imprint .nav__logo {
          font-family: 'Newsreader', serif;
          font-weight: 500;
          font-size: 26px;
          letter-spacing: 0.01em;
          line-height: 1;
        }
        .imprint .nav__rule {
          width: 1px;
          height: 20px;
          background: var(--hair);
          transform: translateY(3px);
        }
        .imprint .nav__imprint {
          font-size: 10.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .imprint .nav__links {
          display: flex;
          gap: 28px;
          margin-left: auto;
          font-size: 16px;
          color: var(--ink-soft);
        }
        .imprint .nav__links a:hover {
          color: var(--ink);
        }
        .imprint .nav__actions {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .imprint .nav__signin {
          font-size: 16px;
          color: var(--ink-soft);
        }
        .imprint .nav__signin:hover {
          color: var(--ink);
        }
        .imprint .nav__cta {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          letter-spacing: 0.02em;
          color: var(--paper);
          background: var(--evergreen);
          padding: 11px 18px;
          border-radius: 0;
        }
        .imprint .nav__cta:hover {
          background: #16301f;
        }

        /* ── hero ────────────────────────────────────────────────────── */
        .imprint .hero {
          max-width: 1240px;
          margin: 0 auto;
          padding: clamp(2.5rem, 4.5vw, 4.25rem) 40px clamp(2.5rem, 5vw, 4rem);
        }
        .imprint .hero__grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
          gap: clamp(2rem, 4vw, 4rem);
          align-items: end;
        }
        .imprint .eyebrow {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--gilt);
          margin: 0 0 22px;
        }
        .imprint .hero__title {
          font-family: 'Newsreader', serif;
          font-weight: 430;
          font-size: clamp(3rem, 8vw, 6.5rem);
          line-height: 0.96;
          letter-spacing: -0.018em;
          margin: 0;
        }
        .imprint .hero__title em {
          color: var(--evergreen);
        }
        .imprint .hero__sub {
          font-size: clamp(1.05rem, 1.6vw, 1.22rem);
          line-height: 1.5;
          color: var(--ink-soft);
          max-width: 34ch;
          margin: 28px 0 0;
        }
        .imprint .hero__cta {
          display: flex;
          gap: 16px;
          margin: 34px 0 0;
          flex-wrap: wrap;
        }
        .imprint .btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13.5px;
          letter-spacing: 0.02em;
          padding: 14px 22px;
          border-radius: 0;
          border: 1px solid transparent;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .imprint .btn--solid {
          background: var(--evergreen);
          color: var(--paper);
        }
        .imprint .btn--solid:hover {
          background: #16301f;
        }
        .imprint .btn--ghost {
          border-color: var(--ink);
          color: var(--ink);
          background: transparent;
        }
        .imprint .btn--ghost:hover {
          background: var(--ink);
          color: var(--paper);
        }
        .imprint .hero__quiet {
          font-size: 12.5px;
          letter-spacing: 0.04em;
          color: var(--ink-soft);
          margin: 26px 0 0;
        }

        .imprint .hero__plate {
          align-self: end;
        }

        /* ── plates (the tipped-in screenshot) ───────────────────────── */
        .imprint .plate {
          margin: 0;
        }
        .imprint .plate__mat {
          background: var(--plate);
          padding: clamp(20px, 2.4vw, 40px);
          box-shadow: var(--lift);
          border-radius: 0;
        }
        .imprint .plate__inset {
          border: 1px solid var(--ink);
          padding: 0;
          line-height: 0;
          overflow: hidden;
          background: #14121a;
        }
        .imprint .plate__inset img {
          display: block;
          width: 100%;
          height: auto;
        }
        .imprint .plate__cap {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 10px 16px;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--hair);
        }
        .imprint .plate__folio {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gilt);
          flex: none;
        }
        .imprint .plate__caption {
          font-family: 'Newsreader', serif;
          font-style: italic;
          font-size: 16px;
          line-height: 1.35;
          color: var(--ink);
        }
        .imprint .plate__figure {
          width: 100%;
          font-size: 11px;
          letter-spacing: 0.03em;
          color: var(--ink-soft);
          text-transform: lowercase;
        }

        /* ── figure bar ──────────────────────────────────────────────── */
        .imprint .figbar {
          margin-top: clamp(3rem, 5vw, 4.5rem);
          border-top: 1px solid var(--ink);
          border-bottom: 1px solid var(--hair);
        }
        .imprint .figbar__row {
          margin: 0;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
        }
        .imprint .fig {
          padding: 26px 30px 26px 0;
          border-right: 1px solid var(--hair);
        }
        .imprint .fig:last-child {
          border-right: none;
        }
        .imprint .fig dt {
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: lowercase;
          color: var(--ink-soft);
          margin-bottom: 12px;
        }
        .imprint .fig dd {
          font-family: 'Newsreader', serif;
          font-weight: 430;
          font-size: clamp(2.4rem, 4.4vw, 3.6rem);
          line-height: 1;
          letter-spacing: -0.02em;
          margin: 0;
          color: var(--ink);
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .imprint .fig dd span {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.04em;
          text-transform: lowercase;
          color: var(--gilt);
          font-weight: 400;
        }

        /* ── full-width hairline edge between sections ───────────────── */
        .imprint .edge {
          height: 1px;
          background: var(--hair);
          max-width: 1240px;
          margin: 0 auto;
        }

        /* ── section shell (prose column + margin folio) ────────────── */
        .imprint .upside,
        .imprint .proof {
          max-width: 1240px;
          margin: 0 auto;
          padding: clamp(6rem, 12vw, 10rem) 40px;
          position: relative;
        }
        .imprint .folio {
          position: absolute;
          top: clamp(6rem, 12vw, 10rem);
          left: 40px;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--gilt);
        }
        .imprint .prose {
          max-width: 660px;
          margin: 0 auto;
        }
        .imprint .kicker {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--gilt);
          margin: 0 0 20px;
        }
        .imprint .upside__head,
        .imprint .proof__head {
          font-family: 'Newsreader', serif;
          font-weight: 430;
          font-size: clamp(2.4rem, 5vw, 4rem);
          line-height: 1.02;
          letter-spacing: -0.02em;
          margin: 0 0 28px;
        }
        .imprint .lead {
          font-size: 19px;
          line-height: 1.6;
          color: var(--ink-soft);
          margin: 0;
        }

        /* ── terms list (the upside items) ───────────────────────────── */
        .imprint .terms {
          list-style: none;
          margin: clamp(3.5rem, 6vw, 5.5rem) auto 0;
          padding: 0;
          max-width: 660px;
        }
        .imprint .term {
          display: grid;
          grid-template-columns: 84px 1fr;
          gap: 24px;
          padding: 34px 0;
          border-top: 1px solid var(--hair);
        }
        .imprint .term:last-child {
          border-bottom: 1px solid var(--hair);
        }
        .imprint .term__num {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          letter-spacing: 0.04em;
          color: var(--gilt);
          padding-top: 8px;
        }
        .imprint .term__body h3 {
          font-family: 'Newsreader', serif;
          font-weight: 480;
          font-size: clamp(1.5rem, 2.4vw, 1.9rem);
          line-height: 1.1;
          letter-spacing: -0.01em;
          margin: 0 0 12px;
        }
        .imprint .term__body p {
          font-size: 17.5px;
          line-height: 1.55;
          color: var(--ink-soft);
          margin: 0;
          max-width: 46ch;
        }

        /* ── proof plates (break the column) ─────────────────────────── */
        .imprint .plates {
          margin: clamp(3.5rem, 6vw, 5.5rem) 0 0;
          display: grid;
          gap: clamp(3rem, 5vw, 4.5rem);
        }
        .imprint .plate--wide {
          max-width: 1240px;
        }
        .imprint .plates__item:nth-child(2) {
          max-width: 860px;
          margin-left: auto;
        }
        .imprint .proof__support {
          font-family: 'Newsreader', serif;
          font-style: italic;
          font-size: clamp(1.35rem, 2.4vw, 1.85rem);
          line-height: 1.35;
          color: var(--ink);
          max-width: 660px;
          margin: clamp(3.5rem, 6vw, 5rem) auto 0;
          text-align: center;
        }

        /* ── evergreen mission plate ─────────────────────────────────── */
        .imprint .mission {
          background: var(--evergreen);
          color: var(--paper);
        }
        .imprint .mission__inner {
          max-width: 1040px;
          margin: 0 auto;
          padding: clamp(5rem, 10vw, 8rem) 40px;
          text-align: center;
        }
        .imprint .mission__folio {
          display: block;
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gilt);
          margin-bottom: 32px;
        }
        .imprint .mission__line {
          font-family: 'Newsreader', serif;
          font-weight: 400;
          font-size: clamp(2.2rem, 5.5vw, 4.4rem);
          line-height: 1.04;
          letter-spacing: -0.02em;
          margin: 0 auto;
          max-width: 18ch;
        }
        .imprint .mission__line em {
          color: #d8b978;
        }
        .imprint .mission__sub {
          font-size: 16px;
          line-height: 1.6;
          color: rgba(251, 247, 239, 0.72);
          margin: 28px auto 0;
          max-width: 46ch;
        }

        /* ── footer ──────────────────────────────────────────────────── */
        .imprint .foot {
          background: var(--paper);
          border-top: 1px solid var(--hair);
        }
        .imprint .foot__inner {
          max-width: 1240px;
          margin: 0 auto;
          padding: clamp(3rem, 5vw, 4.5rem) 40px 2rem;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 40px;
          flex-wrap: wrap;
        }
        .imprint .foot__logo {
          font-family: 'Newsreader', serif;
          font-weight: 500;
          font-size: 30px;
          line-height: 1;
        }
        .imprint .foot__tag {
          font-size: 15px;
          color: var(--ink-soft);
          margin: 12px 0 0;
          max-width: 30ch;
        }
        .imprint .foot__links {
          display: flex;
          flex-wrap: wrap;
          gap: 14px 32px;
          font-size: 16px;
          color: var(--ink-soft);
        }
        .imprint .foot__links a:hover {
          color: var(--ink);
        }
        .imprint .foot__colophon {
          max-width: 1240px;
          margin: 0 auto;
          padding: 22px 40px 40px;
          display: flex;
          align-items: center;
          gap: 18px;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .imprint .foot__colophon-rule {
          flex: 1;
          height: 1px;
          background: var(--hair);
        }

        /* ── tablet ──────────────────────────────────────────────────── */
        @media (max-width: 900px) {
          .imprint .hero__grid {
            grid-template-columns: 1fr;
            align-items: start;
            gap: 2.5rem;
          }
          .imprint .hero__sub {
            max-width: 46ch;
          }
          .imprint .nav__links {
            display: none;
          }
          .imprint .plates__item:nth-child(2) {
            max-width: none;
          }
        }

        /* ── mobile ──────────────────────────────────────────────────── */
        @media (max-width: 560px) {
          .imprint .nav__inner {
            padding: 14px 20px;
          }
          .imprint .nav__imprint {
            display: none;
          }
          .imprint .nav__signin {
            display: none;
          }
          .imprint .hero {
            padding: 2.5rem 20px 2rem;
          }
          .imprint .hero__title {
            font-size: clamp(2.9rem, 15vw, 3.6rem);
          }
          .imprint .hero__cta {
            gap: 12px;
          }
          .imprint .btn {
            flex: 1;
            text-align: center;
          }
          .imprint .figbar__row {
            grid-template-columns: 1fr;
          }
          .imprint .fig {
            padding: 20px 0;
            border-right: none;
            border-bottom: 1px solid var(--hair);
          }
          .imprint .fig:last-child {
            border-bottom: none;
          }
          .imprint .upside,
          .imprint .proof {
            padding: 4rem 20px;
          }
          .imprint .folio {
            position: static;
            display: block;
            margin-bottom: 20px;
          }
          .imprint .term {
            grid-template-columns: 1fr;
            gap: 10px;
            padding: 26px 0;
          }
          .imprint .term__num {
            padding-top: 0;
          }
          .imprint .plate__mat {
            padding: 14px;
          }
          .imprint .plate__caption {
            font-size: 15px;
          }
          .imprint .mission__inner {
            padding: 4rem 20px;
          }
          .imprint .foot__colophon {
            padding: 22px 20px 32px;
          }
          .imprint .foot__inner {
            padding: 2.5rem 20px 1.5rem;
          }
        }
      `}</style>
    </>
  );
}
