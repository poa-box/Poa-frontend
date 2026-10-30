/** Cross-chain display selection stays in the host; indexed identity and coverage come from core. */
import { readIdentityFacts, lookupIdentityFact } from '@poa-box/core/reads/identity';
import { getAllSubgraphUrls, DEFAULT_CHAIN_ID } from '@/config/networks';
import { getUniversalAccountRegistryAddress } from '@/config/contracts';
import { apolloProtocolQuery, createApolloProtocolQuery, PublicDataUnavailable } from '@/lib/graphql/coreQuery';

const identitySources = () => getAllSubgraphUrls().map((source) => ({
  chainId: source.chainId, endpoint: source.url,
  contract: getUniversalAccountRegistryAddress(source.chainId),
  indexed: true, snapshot: 'latest', method: 'graph',
}));
const nameOf = (source) => getAllSubgraphUrls().find(({ chainId, url }) => chainId === source.chainId && url === source.endpoint)?.name || null;
const readIdentity = (selector, { fresh = false } = {}) => {
  const sources = identitySources();
  if (!sources.length) throw new PublicDataUnavailable();
  return readIdentityFacts({ sources, selector,
    query: fresh ? createApolloProtocolQuery({ fetchPolicy: 'network-only' }) : apolloProtocolQuery,
  });
};
const requireAbsence = (facts, selector) => {
  const fact = lookupIdentityFact(facts, selector);
  if (fact.state !== 'known') throw new PublicDataUnavailable(facts.coverage);
};
const availableAccounts = (facts) => facts.data.filter((row) => !row.isDeleted);
const richness = (account, includeUsername = true) => (includeUsername && account.username ? 1 : 0)
  + ['bio', 'avatar', 'github', 'twitter', 'website'].filter((key) => account.metadata?.[key]).length;
const chooseProfile = (rows, includeUsername = true, homeTie = true) => rows.reduce((best, row) => {
  if (!best || richness(row, includeUsername) > richness(best, includeUsername)
      || (homeTie && richness(row, includeUsername) === richness(best, includeUsername)
        && row.source.chainId === DEFAULT_CHAIN_ID && best.source.chainId !== DEFAULT_CHAIN_ID)) return row;
  return best;
}, null);
const profileResult = (row, facts) => ({
  address: row?.id || null, username: row?.username || null, metadata: row?.metadata || null,
  sourceChain: row ? nameOf(row.source) : null, sourceChainId: row?.source.chainId || null,
  isComplete: facts.coverage.status === 'complete', coverage: facts.coverage,
});

export async function isUsernameTakenGlobally(username, excludeAddress = null) {
  const normalized = username.trim().toLowerCase();
  const facts = await readIdentity({ kind: 'names', names: [normalized] });
  const accounts = availableAccounts(facts).filter((row) => row.id.toLowerCase() !== excludeAddress?.toLowerCase());
  if (!accounts.length) requireAbsence(facts, { username: normalized });
  return { taken: accounts.length > 0, chains: accounts.map((row) => nameOf(row.source)), owner: accounts.at(-1)?.id || null };
}

export async function findUsernameAcrossChains(address) {
  const id = address.toLowerCase();
  const facts = await readIdentity({ kind: 'addresses', addresses: [id] });
  const row = availableAccounts(facts).find((account) => account.username.trim());
  if (!row) requireAbsence(facts, { address: id });
  return { username: row?.username || null, chain: row ? nameOf(row.source) : null };
}

export async function findUserByUsernameAcrossChains(username) {
  const normalized = username.trim().toLowerCase();
  const facts = await readIdentity({ kind: 'names', names: [normalized] });
  const row = availableAccounts(facts)[0];
  if (!row) requireAbsence(facts, { username: normalized });
  return { address: row?.id || null, username: row?.username || null, chain: row ? nameOf(row.source) : null };
}

export async function resolveUsernamesAcrossChains(usernames) {
  const normalized = [...new Set((usernames || []).map((name) => name.toLowerCase().trim()).filter(Boolean))];
  const resolved = new Map();
  if (!normalized.length) return { resolved, notFound: [] };
  const facts = await readIdentity({ kind: 'names', names: normalized }, { fresh: true });
  for (const row of availableAccounts(facts)) {
    const name = row.username.toLowerCase();
    if (!resolved.has(name) || row.source.chainId === DEFAULT_CHAIN_ID) resolved.set(name, row.user);
  }
  const notFound = normalized.filter((name) => !resolved.has(name));
  for (const username of notFound) requireAbsence(facts, { username });
  return { resolved, notFound };
}

export async function searchUsersByUsernameAcrossChains(query, limit = 8) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const facts = await readIdentity({ kind: 'search', query: normalized });
  if (!facts.data.length && facts.coverage.status !== 'complete') throw new PublicDataUnavailable(facts.coverage);
  const byAddress = new Map();
  for (const row of availableAccounts(facts)) {
    const address = row.id.toLowerCase();
    if (!row.username || byAddress.has(address)) continue;
    byAddress.set(address, { address, username: row.username, chain: nameOf(row.source) });
  }
  const rank = (name) => name.toLowerCase() === normalized ? 0 : name.toLowerCase().startsWith(normalized) ? 1 : 2;
  const results = [...byAddress.values()].sort((a, b) => rank(a.username) - rank(b.username)
    || a.username.toLowerCase().localeCompare(b.username.toLowerCase())).slice(0, limit);
  return Object.assign(results, { coverage: facts.coverage });
}

export async function findUserProfileByUsername(username) {
  const normalized = username.trim().toLowerCase();
  const facts = await readIdentity({ kind: 'names', names: [normalized] });
  const row = chooseProfile(availableAccounts(facts), false, false);
  if (!row) requireAbsence(facts, { username: normalized });
  return profileResult(row, facts);
}

export async function findUserProfileByAddress(address, { fresh = false } = {}) {
  if (!address) return { address: null, username: null, metadata: null, sourceChain: null, sourceChainId: null };
  const id = address.toLowerCase();
  const facts = await readIdentity({ kind: 'addresses', addresses: [id] }, { fresh });
  const row = chooseProfile(availableAccounts(facts));
  if (!row) requireAbsence(facts, { address: id });
  return profileResult(row, facts);
}

export async function findUserProfilesByAddresses(addresses, { fresh = false } = {}) {
  const map = new Map();
  const ids = [...new Set((addresses || []).map((address) => address?.toLowerCase()).filter(Boolean))];
  if (!ids.length) return map;
  const facts = await readIdentity({ kind: 'addresses', addresses: ids }, { fresh });
  for (const id of ids) {
    const row = chooseProfile(availableAccounts(facts).filter((account) => account.id.toLowerCase() === id));
    if (row) map.set(id, profileResult(row, facts));
  }
  // A missing entry means confirmed absence only when every requested source completed.
  return Object.assign(map, { coverage: facts.coverage });
}

export async function findUserOrgsAcrossChains(address) {
  // Membership cards are a separate, optional public read; account lookups don't load this leaf.
  const { readMembershipCardFacts } = await import('@poa-box/core/reads/org');
  const sources = getAllSubgraphUrls();
  const results = await Promise.allSettled(sources.map((source) => readMembershipCardFacts({
    source: { chainId: source.chainId, endpoint: source.url, account: address.toLowerCase(), indexed: true, snapshot: 'latest', method: 'graph' },
    query: apolloProtocolQuery,
  })));
  const orgs = [];
  let complete = sources.length > 0;
  for (const result of results) {
    if (result.status !== 'fulfilled') { complete = false; continue; }
    const snapshot = result.value;
    if (snapshot.coverage.status !== 'complete') complete = false;
    for (const card of snapshot.data) {
      orgs.push({
        id: `${card.orgId}-${card.account}`, organization: card.organization,
        membershipStatus: card.currentMembership.state === 'known' ? card.currentMembership.value ? 'Active' : 'Inactive' : null,
        currentMembership: card.currentMembership, historyIndexed: card.historyIndexed,
        participationTokenBalance: card.participationTokenBalance, totalTasksCompleted: card.totalTasksCompleted,
        totalVotes: card.totalVotes, totalModulesCompleted: card.totalModulesCompleted,
        firstSeenAt: card.firstSeenAt, lastActiveAt: card.lastActiveAt, tokenLabel: card.tokenLabel,
        sourceChainId: card.source.chainId,
      });
    }
  }
  if (!orgs.length && !complete) throw new PublicDataUnavailable();
  return Object.assign(orgs, { isComplete: complete });
}

/** Preserve the global-account host's first-username/richest-profile display policy. */
export async function findGlobalAccountAcrossChains(address, { fresh = false } = {}) {
  const facts = await readIdentity({ kind: 'addresses', addresses: [address.toLowerCase()] }, { fresh });
  const rows = availableAccounts(facts).filter((row) => row.username);
  if (!rows.length) requireAbsence(facts, { address: address.toLowerCase() });
  return { username: rows[0]?.username || null, profileMetadata: chooseProfile(rows, false, false)?.metadata || null,
    isComplete: facts.coverage.status === 'complete' };
}
