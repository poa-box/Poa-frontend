// Shared production landing copy. Revenue claims remain conditional on distribution.
import { PROTO_COPY } from '@/components/marketing/protoCopy';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';


export const HERO = {
  eyebrow: 'Built together. Owned together.',
  headline: 'Do the work. Own what you build.',
  headlineLines: ['Do the work.', 'Own what', 'you build.'],
  subline: 'Software for worker cooperatives, community organizations, and collectives. Organize work, make decisions together, and share value under rules your group chooses.',
  ctaPrimary: 'Start an organization',
  ctaSecondary: 'See how it works',
};

export const UPSIDE = PROTO_COPY.pain;

export const PROOF_COPY = PROTO_COPY.proof;

export const FOOTER = {
  tagline: PROTO_COPY.footer.tagline, // "Organizations owned by the people in them"
  selfHost: PROTO_COPY.footer.selfHost, // "Poa itself runs as an organization on Poa..."
};


export const NAV = {
  links: [
    { label: 'How it works', href: '/#how-it-works', anchor: true },
    { label: 'Docs', href: '/docs', fromSm: true },
    { label: 'Organizations', href: '/explore', fromMd: true },
    { label: 'About', href: '/about', fromMd: true },
  ],
  signIn: 'Sign in',
  cta: 'Join an Organization',
};

export const FOOTER_FULL = {
  tagline: FOOTER.tagline,
  selfHost: FOOTER.selfHost,
  graceNote: 'Start something that lasts.',
  columns: [
    {
      heading: 'Product',
      links: [
        { label: 'Start an organization', href: '/create' },
        { label: 'Browse organizations', href: '/explore' },
        { label: 'Templates', href: '/docs/deployment-wizard' },
        { label: 'Docs', href: '/docs/' },
        { label: 'AI agents', href: '/docs/ai-agent-coordination/' },
      ],
    },
    {
      heading: 'Project',
      links: [
        { label: 'About', href: '/about' },
        { label: 'Source', href: 'https://github.com/poa-box', external: true },
        { label: 'Discord', href: 'https://discord.gg/9SD6u4QjTt', external: true },
        { label: 'X', href: 'https://twitter.com/PoaPerpetual', external: true },
      ],
    },
  ],
  colophon: 'Open source. Common ground.',
  std: 'std. 001',
};

export const LEDGER = {
  title: 'Already taking shape.',
  description: 'Real people. Shared work. Organizations of their own.',
};

export const PROBLEM = {
  rail: 'sec 02 / together',
  kicker: 'A shared beginning',
  heading: 'An idea brings you together. Build from there.',
  lead: 'A project. A place. Something your community needs. Give the people who show up a way to carry it forward, together.',
  items: [
    { title: 'Make every contribution count', body: 'Give the work a home, from the first task to the finished project. Everyone can see what has been done and who made it happen.' },
    { title: 'Put the money in the open', body: 'A shared treasury and clear rules for how it moves. Your group knows what it has, and how to share it.' },
    { title: 'Find your direction together', body: 'Bring decisions to the people doing the work. Agree on the rules, then shape what comes next.' },
  ],
  close: 'More than a group. Something you own together.',
};

export const THE_WORK = {
  rail: 'sec 03 / the work',
  kicker: 'The work',
  heading: 'Your work becomes your stake.',
  lead:
    `Turn approved work into ${DEFAULT_TOKEN_LABEL}: a recorded stake that can count in decisions and funded revenue distributions under your group’s rules.`,
  points: [
    {
      title: 'A stake you earn',
      body:
        `A task can award ${DEFAULT_TOKEN_LABEL} when a reviewer approves your work. They cannot be bought, sold, or given away.`,
    },
    {
      title: 'A payment and a lasting stake',
      body:
        `A task can offer a funded payment alongside ${DEFAULT_TOKEN_LABEL}. See the reward, payment asset, and review requirements before you begin.`,
    },
    {
      title: 'A clear path from idea to done',
      body:
        'Post a task, find the right person, and review the result. Your group decides who can do and approve the work.',
    },
  ],
  ownershipNote: `${DEFAULT_TOKEN_LABEL} are participation rights inside Poa. Creating an organization does not create a legal cooperative or grant legal equity.`,
  guideLabel: `Understand ${DEFAULT_TOKEN_LABEL} and ownership`,
  guideHref: '/docs/contribution-and-ownership/',
  fig: {
    id: 'fig 03',
    txt: 'shared task board · contribution rewards posted in the open',
    anno: 'each column is a stage: open, in progress, in review, completed',
  },
};

export const THE_SAY = {
  rail: 'sec 04 / the say',
  kicker: 'The say',
  heading: 'A voice in what comes next.',
  lead:
    'The people building the organization help shape its direction. Choose how your group votes, make decisions in the open, and put them into motion.',
  earnedLine: 'Give membership, contribution, or both a place in decisions.',
  points: [
    {
      title: 'Choose how you decide',
      body:
        'Equal votes among eligible members, votes weighted by contribution, or a blend. Choose who can take part and how their votes count.',
    },
    {
      title: 'Every decision is on the record',
      body:
        'Proposals, votes, and results have a public record. Describe the reason for each proposal so others can follow the decision.',
    },
    {
      title: 'The rules can change, by vote',
      body:
        'Binding proposals can change supported rules, permissions, and spending. Members can check the result and whether its action completed.',
    },
  ],
  guideLabel: 'Explore member voting and binding decisions',
  guideHref: '/docs/hybridVoting/',
  fig: {
    id: 'fig 04',
    txt: 'a real election · five candidates, member votes, a clear winner',
    anno: 'eligible members choose who takes responsibility',
  },
};

export const THE_MONEY = {
  rail: 'sec 05 / the money',
  kicker: 'The money',
  heading: 'Build something. Share in its success.',
  lead:
    'When your group approves a funded revenue distribution, each contributor can claim their recorded allocation. The work you put in has a place in what comes back.',
  points: [
    {
      title: 'A treasury spent only by the rules',
      body:
        'Members can inspect shared balances and approve treasury spending through binding votes. Task payments follow the rewards and review rules already agreed.',
    },
    {
      title: 'Revenue split by earned share',
      body:
        `Prepare a distribution in proportion to recorded ${DEFAULT_TOKEN_LABEL} balances. Members vote on that allocation, and recipients claim once it is approved and funded.`,
    },
    {
      title: 'Check your own share',
      body:
        'See the amount allocated to you and whether you have claimed it. Each distribution keeps its own record, even as later work earns new rewards.',
    },
  ],
  candor:
    'Revenue sharing depends on available funds and an approved distribution. Earning a stake does not guarantee income.',
  guideLabel: 'See how shared funds and distributions work',
  guideHref: '/docs/treasury-management/',
  exampleLabel: 'Historical example: Argus treasury',
  stats: [
    { k: 'shown in this example', v: '3 distributions' },
    { k: 'claimed in this example', v: '100%' },
  ],
  fig: {
    id: 'fig 05',
    txt: 'historical Argus treasury · three fully claimed distributions',
    anno: 'recorded allocations and claims',
  },
  statsFig: {
    id: 'fig 05a',
    txt: 'historical treasury view · shared balances and distribution tools',
  },
};

export const THE_PEOPLE = {
  rail: 'sec 06 / the people',
  kicker: 'The people',
  heading: 'People make it possible.',
  lead:
    'Make room for the people who move your idea forward. Give each role clear responsibilities, and let new members find their place.',
  points: [
    {
      title: 'Powers are written, not assumed',
      body:
        'Each role spells out exactly what it can do. When officers change, the powers stay put and the organization keeps its shape.',
    },
    {
      title: 'A clear way to join',
      body:
        'Create an account with a username and passkey, or connect an existing wallet. Follow the group’s joining rules, then accept your role when eligible.',
    },
  ],
  audienceIntro: {
    kicker: 'Built for',
    heading: 'Find your starting point.',
    body: 'Templates give your group a starting set of roles, joining rules, and voting. Choose one, then make it your own.',
    cta: 'Choose a template',
    href: '/create/',
  },
  audiences: [
    { line: 'Student organizations', href: '/docs/community-groups/', description: 'Plan events, share responsibilities, and give the next class a strong start.' },
    { line: 'Community spaces', href: '/docs/community-groups/', description: 'Care for a shared place, fund improvements, and recognize the people who keep it going.' },
    { line: 'Creative collectives', href: '/docs/what-can-you-build/', description: 'Bring a project to life, make decisions together, and share what it earns.' },
    { line: 'Open-source projects', href: '/docs/open-source-collectives/', description: 'Recognize contributions, coordinate maintainers, and put funding behind the work.' },
    { line: 'Worker owned businesses', href: '/docs/worker-cooperatives/', description: 'Share the work, the decisions, and the revenue with the people building the business.' },
  ],
  fig: {
    id: 'fig 06',
    txt: 'roles and their exact powers · join, approve, shares, vote',
  },
  membersFig: {
    id: 'fig 06a',
    txt: 'real members, grouped by role · activity in the open',
  },
};

export const PROOF = {
  rail: 'sec 07 / the record',
  kicker: 'The record',
  line: 'Every organization on Poa is public: its rules, its decisions, its books.',
  countSuffix: 'keep their books here.',
  cta: 'Read the books for yourself',
  ctaHref: '/explore',
};

export const ETHOS = {
  rail: 'sec 08 / the reason',
  kicker: 'The reason',
  centerpiece: 'What you build together belongs to you.',
  body:
    'The people who do the work can build a lasting place in the organization. A simple idea, with room for shared decisions, recognized contributions, and a future you help shape.',
  rented:
    'Your group holds the rules, the money, and the record. Poa is open source, so what you build can keep going on your own terms.',
  selfHost: 'Poa itself runs as an organization on Poa.',
  selfHostLink: 'Our books are public too',
};

export const START_CLOSE = {
  rail: 'sec 09 / start',
  kicker: 'Your next chapter',
  heading: 'Start with your people.',
  steps: [
    {
      no: '01',
      title: 'Choose the rules',
      body:
        'Pick a template and set how your group decides, rewards work, and shares funds. Supported rules can change later through governance.',
    },
    {
      no: '02',
      title: 'Bring the people',
      body:
        'Invite the first members through your chosen joining process. Give each role the powers it needs to help the group move forward.',
    },
    {
      no: '03',
      title: 'Build your first thing',
      body:
        'Post the first task. Make a decision together. Turn a shared idea into something real, one contribution at a time.',
    },
  ],
  quiet: 'Explore setup before signing in. Use a passkey or existing wallet to launch; network fees may apply.',
  ctaPrimary: 'Start an organization',
  ctaSecondary: 'Browse organizations',
  ctaSecondaryHref: '/explore',
};

export const LANDING_COPY = {
  NAV,
  HERO,
  LEDGER,
  PROBLEM,
  THE_WORK,
  THE_SAY,
  THE_MONEY,
  THE_PEOPLE,
  PROOF,
  ETHOS,
  START_CLOSE,
  FOOTER: FOOTER_FULL,
};

export default LANDING_COPY;
