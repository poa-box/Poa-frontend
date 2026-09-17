import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';

// Production /about copy (P3). Direction A · "public works".
//
// The /about page re-grounds the landing's story in five blocks (BRIEF §6):
//   1. The belief. One paragraph, dual-read, the page's display moment.
//   2. The problem we saw. The group-chat era; ownership going to platforms; no
//      villains except formlessness.
//   3. What Poa is. Three sentences, benefit-first.
//   4. How we hold ourselves to it. Poa runs on Poa, books public, AGPL,
//      self-hostable, no one can lock you in, including us.
//   5. Where we are. Honest and small, link to /explore.
//
// House style (BRIEF §3): sentence case, no em-dashes, no exclamations, no
// superlatives, brand always "Poa" (never all-caps), banned vocab absent, every
// value-laden line passes the dual-read test (self-reliance + fairness both).
// Verified clean by scripts/marketing/check-vocab.mjs --src.
//
// Draft ship-grade; Gate 2 (the copy panel) may revisit wording.

// ── Block 1 · The belief ──────────────────────────────────────────────────
// The display moment. A short belief line set large, then one dual-read
// paragraph. "We think the people who build a thing should own it" register.
export const BELIEF = {
  rail: 'about 01 / the belief',
  kicker: 'The belief',
  // Set large, the one strong display line on this quieter, prose-forward page.
  headline: 'The people who build a thing should own it',
  body:
    'That is the idea behind Poa. We want the people doing the work and the communities it serves to share in decisions, value, and a lasting future. Clear agreements, recognized contributions, and a public record give people a practical way to build toward that together.',
};

// ── Block 2 · The problem we saw ──────────────────────────────────────────
// The group-chat era; ownership going to platforms. No villains except
// formlessness (BRIEF §3). The group is alive and stuck, not dying.
export const PROBLEM = {
  rail: 'about 02 / the problem',
  kicker: 'The problem we saw',
  heading: 'A group forms in a chat, and then it outgrows it',
  lead:
    'Most groups start the same way: a chat thread, a shared document, a running list of who owes whom. It works while everyone can hold the whole thing in their head. Then the group grows, the work piles up, and the informal shape starts to strain.',
  items: [
    {
      title: 'The record lives in memory',
      body:
        'Who did what, who is owed what, what the group agreed last month. It is all real, and none of it is written down anywhere the whole group can see.',
    },
    {
      title: 'The money runs through a person',
      body:
        'Funds sit in someone’s personal account because that was the fastest way to start. The split everyone assumed is fair was never actually agreed.',
    },
    {
      title: 'The ownership ends up elsewhere',
      body:
        'The tools a group leans on to organize tend to own the audience, the data, and the relationship. The people doing the work build value that lands with the platform, not with them.',
    },
  ],
  // The close: name the pain plainly, still no villain but formlessness.
  close: 'The group was alive and working, and the people doing the most owned none of it.',
};

// ── Block 3 · What Poa is ─────────────────────────────────────────────────
// Three sentences, benefit-first (BRIEF §6). Each traces to a §4 cleared claim.
export const WHAT = {
  rail: 'about 03 / what poa is',
  kicker: 'What Poa is',
  heading: 'A place to turn a group into an organization it owns',
  sentences: [
    'Poa means Perpetual Organization Architect. It is open-source software for worker cooperatives, community organizations, and collectives to organize work, membership, votes, and shared funds.',
    `Approved work can earn ${DEFAULT_TOKEN_LABEL}: participation rights that can count toward voting and funded revenue distributions under the group’s rules. Legal ownership arrangements are separate.`,
    'The core record is public and compatible tools can work with the same organization. You can read before signing in, then use a passkey or an existing wallet to participate. Network fees may apply.',
  ],
  guideLabel: 'Explore how Poa works',
  guideHref: '/docs/what-is-poa/',
};

// ── Block 4 · How we hold ourselves to it ─────────────────────────────────
// Poa runs as an organization on Poa, books public, AGPL, self-hostable,
// "built so no one can lock you in, including us." (BRIEF §6.) The live-linked
// "our books are public too" is handled in the component via the registry hook,
// mirroring the landing Ethos plate.
export const HOLD = {
  rail: 'about 04 / how we hold ourselves',
  kicker: 'How we hold ourselves to it',
  heading: 'We run Poa the way we ask you to run yours',
  body:
    'Poa itself runs as an organization on Poa. Approved contributions can earn a stake, eligible members vote on decisions, and the record is public. Working this way helps us learn where the product needs care.',
  // Sentence prefix + live-linked tail (component adds the org link when the
  // registry confirms the Poa org exists; keep-verbatim self-host line).
  selfHost: 'Poa itself runs as an organization on Poa.',
  selfHostLink: 'Our books are public too',
  points: [
    {
      title: 'Open-source, under the AGPL',
      body:
        'Poa’s source is available under the AGPL. People can inspect it, run it, and contribute improvements under that license.',
    },
    {
      title: 'Yours to host yourself',
      body:
        'A maintained, compatible copy of Poa can work with the same organization. Running it still requires hosting and access to the networks that hold its records.',
    },
    {
      title: 'More ways to keep going',
      body:
        'Public records and open tools reduce dependence on a single website. Members can inspect their organization and maintain other ways to take part.',
    },
  ],
};

// ── Block 5 · Where we are ────────────────────────────────────────────────
// Honest and small, link to /explore (BRIEF §6). Live registry counts carry the
// honesty; the count sentence is assembled in the component from live data.
export const WHERE = {
  rail: 'about 05 / where we are',
  kicker: 'Where we are',
  heading: 'Early, and out in the open',
  body:
    'Poa is live today and real organizations are already running on it. We are still small, and that is the honest state of things. It also means the groups here now are shaping what Poa becomes.',
  // Rendered as "{n} organizations and {m} members keep their books here." once
  // the live registry answers; stays quietly empty until then.
  countSuffix: 'keep their books here.',
  cta: 'See the organizations for yourself',
  ctaHref: '/explore',
};

export const ABOUT_COPY = {
  BELIEF,
  PROBLEM,
  WHAT,
  HOLD,
  WHERE,
};

export default ABOUT_COPY;
