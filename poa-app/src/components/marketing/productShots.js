// P0 product-evidence manifest. Real, logged-out captures of live organizations on
// Poa (no seeded or fabricated data), photographed from the static export by
// scripts/marketing/capture-product-shots.mjs. Alt text and captions are ship-ready
// marketing copy and obey the vocabulary policy in docs/landing-overhaul-v2/BRIEF.md.
// Dimensions are the PNG pixel sizes (deviceScaleFactor baked in); render at half
// (desktop, DSF 2) or one third (mobile, DSF 3) for crisp 1x layout sizes.
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';

export const PRODUCT_SHOTS = {
  taskDetail: {
    src: '/images/product/task-detail.webp',
    width: 1344,
    height: 816,
    dsf: 2,
    org: 'Decentral Park',
    alt: `A completed task in Decentral Park: propagate plant cuttings and install propagation sculptures, with a reward of 50 ${DEFAULT_TOKEN_LABEL}.`,
    caption: `This completed task awarded 50 ${DEFAULT_TOKEN_LABEL} when it was approved.`,
  },
  tasksBoard: {
    src: '/images/product/tasks-board.webp',
    width: 2400,
    height: 1630,
    dsf: 2,
    org: 'Decentral Park',
    alt: `A task board for a community workspace project with columns for open, in progress, in review, and completed work, with contribution rewards in ${DEFAULT_TOKEN_LABEL}.`,
    caption: 'Work is posted, claimed, reviewed, and paid on a shared board.',
  },
  voteTally: {
    src: '/images/product/vote-tally.webp',
    width: 1200,
    height: 968,
    dsf: 2,
    org: 'KUBI',
    alt: 'Election results for a director of education role: five candidates, real member votes, and a clear winner at 85 percent.',
    caption: 'A recorded member election from Kansas Blockchain, then named KUBI.',
  },
  treasury: {
    src: '/images/product/treasury.webp',
    width: 1392,
    height: 1184,
    dsf: 2,
    org: 'Argus',
    alt: 'Historical Argus treasury screenshot showing three distributions, each fully claimed.',
    caption: 'A historical example of recorded allocations and claims in the Argus treasury.',
  },
  treasuryStats: {
    src: '/images/product/treasury-stats.webp',
    width: 1400,
    height: 464,
    dsf: 2,
    org: 'Argus',
    alt: 'Historical Argus treasury header showing shared balances and distribution tools.',
    caption: 'A historical view of shared balances and distribution tools.',
  },
  teamMatrix: {
    src: '/images/product/team-matrix.webp',
    width: 2272,
    height: 512,
    dsf: 2,
    org: 'KUBI',
    alt: 'A permissions table showing each role in the organization and exactly what it can do.',
    caption: 'Every role has its powers written down.',
  },
  teamMembers: {
    src: '/images/product/team-members.webp',
    width: 2272,
    height: 1646,
    dsf: 2,
    org: 'KUBI',
    alt: 'The members of a student organization, each with their roles and activity.',
    caption: 'Real people, real roles, in the open.',
  },
  exploreStats: {
    src: '/images/product/explore-stats.webp',
    width: 1000,
    height: 230,
    dsf: 2,
    org: 'registry',
    alt: 'Live counts from the public registry of organizations on Poa.',
    caption: 'Every organization on Poa is public: its rules, its decisions, its books.',
  },
  tasksBoardMobile: {
    src: '/images/product/tasks-board-mobile.webp',
    width: 1170,
    height: 2532,
    dsf: 3,
    org: 'Decentral Park',
    alt: `The task list on a phone: community tasks with their status and reward in ${DEFAULT_TOKEN_LABEL}.`,
    caption: 'The whole organization fits in a pocket.',
  },
};

export const PRODUCT_SHOT_LIST = Object.values(PRODUCT_SHOTS);
