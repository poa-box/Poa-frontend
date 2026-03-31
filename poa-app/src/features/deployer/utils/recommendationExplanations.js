/**
 * Contextual explanations for recommendation sections.
 * Maps (templateId, variationKey) → per-section explanation strings.
 */

const explanations = {
  'student-org': {
    roles: 'A two-tier structure with Executives for continuity and Members for broad participation mirrors how most student clubs naturally organize.',
    joining: 'Members need a vouch from an Executive to maintain quality while keeping the bar low. No quick join ensures people commit intentionally.',
    taskManagement: 'Executives handle task creation and review to keep activities organized, while all members can claim tasks to contribute.',
    _variations: {
      default: {
        voting: '70% democracy ensures every member\'s voice matters, while 30% contribution weight rewards active participation. 35% quorum balances inclusivity with efficiency.',
        features: 'Education Hub helps onboard new members each semester. Elections let the club democratically choose leadership.',
      },
      'social-club': {
        voting: 'Social clubs thrive on equal participation. 70/30 keeps things democratic while rewarding those who organize events. Lower 25% quorum means decisions don\'t stall when people are busy with classes.',
        features: 'Education Hub helps onboard new members each semester. Elections let the club democratically choose leadership.',
      },
      'student-government': {
        voting: 'Student government needs more weight on contribution (40%) to recognize representatives who put in the work. Higher 40% quorum ensures decisions have broad legitimacy.',
        features: 'Education Hub is essential for teaching parliamentary procedure. Elections are critical for democratic legitimacy.',
      },
      'service-org': {
        voting: 'Service orgs balance equal voice with recognizing coordinators who manage projects. 50/50 split and 30% quorum reflect this balance.',
        features: 'Education Hub helps volunteers learn project management. Elections enable democratic leadership transitions.',
      },
      'high-turnover': {
        voting: 'High turnover means new members need real voting power quickly — 60/40 favoring democracy ensures newcomers aren\'t marginalized. 30% quorum accounts for fluctuating membership.',
        features: 'Education Hub is critical when members turn over frequently — it maintains institutional knowledge.',
      },
      'large-org': {
        voting: 'Large organizations need lower barriers to decision-making. 50/50 split recognizes both equal voice and active contribution. 25% quorum prevents gridlock in large groups.',
        features: 'Education Hub helps onboard new members each semester. Elections let the organization democratically choose leadership.',
      },
    },
  },

  'worker-coop': {
    roles: 'Worker-Owners are the primary role — everyone is an equal owner. Coordinators handle day-to-day logistics but have no extra voting power.',
    joining: 'Cooperative membership is intentional. New members join through the existing team rather than open signup.',
    taskManagement: 'Both Worker-Owners and Coordinators can create and manage tasks — flat collaboration reflects cooperative principles.',
    _variations: {
      default: {
        voting: 'Cooperatives prioritize democratic ownership — 80% democracy weight reflects the one-member-one-vote principle. 50% quorum ensures decisions have broad support.',
        features: 'Elections let the group rotate coordinator roles democratically.',
      },
      'small-high-trust': {
        voting: 'In a small, high-trust team, near-pure democracy (95/5) works because everyone knows each other. 60% quorum ensures major decisions involve most of the team.',
        features: 'Elections let the group rotate coordinator roles democratically.',
      },
      'growing-mixed-trust': {
        voting: 'As trust is still building, 70/30 gives meaningful weight to those who\'ve demonstrated commitment. 40% quorum balances participation with pragmatism.',
        features: 'Elections let the group rotate coordinator roles democratically.',
      },
      'large-enterprise': {
        voting: 'At scale, contribution-weighted voting (60/40) helps coordinate efficiently while maintaining democratic foundations. 30% quorum acknowledges not everyone participates in every decision.',
        features: 'Elections let the group rotate coordinator roles democratically.',
      },
      'fast-paced': {
        voting: 'Fast-paced environments need efficient decision-making. 70/30 with 35% quorum enables quick decisions without losing democratic character.',
        features: 'Elections let the group rotate coordinator roles democratically.',
      },
    },
  },

  'community-dao': {
    roles: 'Community Members form the base — open to all. Stewards provide coordination and moderation without top-down authority.',
    joining: 'Quick Join lets anyone become a Community Member instantly — open communities grow faster.',
    taskManagement: 'Stewards manage projects and review tasks, while everyone can create and claim tasks — empowering bottom-up contribution.',
    _variations: {
      default: {
        voting: 'A balanced 50/50 split means everyone has equal baseline voice while active contributors earn additional influence. 30% quorum is realistic for community-scale participation.',
        features: 'Elections allow the community to choose its Stewards democratically.',
      },
      'active-community': {
        voting: 'Highly engaged communities can lean into democracy (70/30). Higher 40% quorum works because people actually show up.',
        features: 'Elections allow the community to choose its Stewards democratically.',
      },
      'broad-community': {
        voting: 'Low-participation communities benefit from contribution weighting (30/70) — it rewards the people who actually show up. 20% quorum prevents stalled decisions.',
        features: 'Elections allow the community to choose its Stewards democratically.',
      },
      neighborhood: {
        voting: 'Geographic communities need accessible governance. 60/40 balances equal voice with recognizing organizers. 25% quorum is realistic for neighborhood participation rates.',
        features: 'Elections allow the community to choose its Stewards democratically.',
      },
      'professional-community': {
        voting: 'Professional communities value expertise — 40/60 favoring contribution weight lets domain knowledge carry more influence. 25% quorum reflects busy professionals.',
        features: 'Elections allow the community to choose its Stewards democratically.',
      },
      transitioning: {
        voting: 'Organizations transitioning from formal structures need balanced governance (50/50) and slightly higher quorum (35%) to maintain stability during the change.',
        features: 'Elections allow the community to choose its Stewards democratically.',
      },
    },
  },

  'creative-collective': {
    roles: 'A single Artist role means everyone is truly equal — no hierarchy, no titles, just collaborators.',
    joining: 'No quick join — new artists are brought in intentionally to maintain the collective\'s creative vision.',
    taskManagement: 'Everyone can create, review, and claim tasks — fully egalitarian project management.',
    _variations: {
      default: {
        voting: 'Creative collectives value equality above all — 90/10 ensures every artist\'s voice is nearly equal, with a small nod to those who contribute most. 50% quorum ensures strong consensus.',
        features: 'Keeping things simple lets the collective focus on what matters — creating together.',
      },
      'consensus-focused': {
        voting: 'Consensus-driven collectives work best with pure democracy (100/0) — every artist\'s voice is equal. 80% quorum ensures near-unanimous agreement on decisions.',
        features: 'No extra features needed — consensus collectives keep things simple and focused.',
      },
      'autonomous-artists': {
        voting: 'Independent artists sharing a collective benefit from near-pure democracy (95/5). Lower 40% quorum respects autonomy — not every collective decision requires everyone.',
        features: 'Keeping things simple lets each artist focus on their own work.',
      },
      'project-based': {
        voting: 'Project-based collectives need slightly more contribution weight (85/15) to coordinate efficiently. 35% quorum keeps projects moving.',
        features: 'Keeping things simple lets the collective focus on projects.',
      },
      'large-collective': {
        voting: 'Larger collectives need structure without hierarchy. 85/15 with 35% quorum enables coordination at scale.',
        features: 'Keeping things simple lets the collective focus on creating together.',
      },
    },
  },

  'open-source': {
    roles: 'Maintainers steward the project\'s direction. Contributors can join freely and earn influence through code and other contributions.',
    joining: 'Quick Join for Contributors lets anyone start contributing immediately — critical for open source growth.',
    taskManagement: 'Maintainers manage projects and review work. Contributors can create and claim tasks — meritocratic but accessible.',
    _variations: {
      default: {
        voting: 'Open source rewards merit — 30/70 favoring contribution weight means those who build the project have the most influence. 25% quorum is realistic for open source participation.',
        features: 'No extra features needed — keep the project lean and focused on shipping.',
      },
      'early-stage': {
        voting: 'New projects benefit from equal voice (50/50) — early contributors should all have say in the project\'s direction. Higher 40% quorum ensures alignment on foundational decisions.',
        features: 'No extra features needed early on — keep the project lean and focused on shipping.',
      },
      'growing-project': {
        voting: 'Growing projects shift toward contribution weight (35/65) as meritocracy becomes important. 30% quorum reflects increasing participant diversity.',
        features: 'No extra features needed — keep the project lean and focused on shipping.',
      },
      'large-established': {
        voting: 'Established projects rely heavily on contribution weight (20/80) — those who build the project guide its direction. 20% quorum is realistic for large contributor bases.',
        features: 'No extra features needed — the project speaks for itself.',
      },
      'community-focused': {
        voting: 'Mixed-contribution projects balance code with community work (40/60). 30% quorum lets decisions happen without requiring every contributor.',
        features: 'No extra features needed — keep the project lean and focused.',
      },
    },
  },

  custom: {
    roles: 'Starting with a single flexible Member role — you can add more roles and customize the hierarchy in the next steps.',
    joining: 'No automatic joining — you control exactly how new members are admitted.',
    taskManagement: 'All members can manage tasks. You can restrict this to specific roles in the next steps.',
    _variations: {
      default: {
        voting: 'A balanced 50/50 starting point that you can tune in the next steps.',
        features: 'No features enabled by default — enable what you need in the next steps.',
      },
    },
  },
};

/**
 * Get contextual explanations for a recommendation.
 * Falls back to default variation if specific variation not found.
 */
export function getRecommendationExplanations(templateId, variationKey) {
  const templateExplanations = explanations[templateId];
  if (!templateExplanations) {
    return {
      voting: '',
      roles: '',
      joining: '',
      taskManagement: '',
      features: '',
    };
  }

  const variationExplanations =
    templateExplanations._variations?.[variationKey] ||
    templateExplanations._variations?.default ||
    {};

  return {
    voting: variationExplanations.voting || '',
    roles: templateExplanations.roles || '',
    joining: templateExplanations.joining || '',
    taskManagement: templateExplanations.taskManagement || '',
    features: variationExplanations.features || '',
  };
}
