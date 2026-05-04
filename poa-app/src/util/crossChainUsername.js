/**
 * Cross-chain username utilities
 *
 * Usernames are registered per-chain on UniversalAccountRegistry contracts.
 * These utilities query ALL mainnet subgraphs to ensure global uniqueness
 * and find existing usernames across chains.
 */

import { getAllSubgraphUrls, DEFAULT_CHAIN_ID } from '@/config/networks';

/**
 * Check if a username is taken on ANY chain.
 * Queries all mainnet subgraph endpoints in parallel.
 *
 * @param {string} username - Username to check (case-insensitive)
 * @param {string} [excludeAddress] - Address to exclude (user's own address)
 * @returns {Promise<{ taken: boolean, chains: string[], owner: string|null }>}
 */
export async function isUsernameTakenGlobally(username, excludeAddress = null) {
  const sources = getAllSubgraphUrls();
  const trimmed = username.trim().toLowerCase();

  const query = `
    query CheckUsername($username: String!) {
      accounts(where: { username: $username }, first: 1) {
        id
        user
        username
      }
    }
  `;

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const res = await fetch(source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { username: trimmed } }),
      });
      const json = await res.json();
      const account = json?.data?.accounts?.[0];
      return { chain: source.name, chainId: source.chainId, account };
    })
  );

  const takenOn = [];
  let owner = null;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { chain, account } = result.value;
    if (!account) continue;

    // If excludeAddress provided, skip if it's the user's own registration
    if (excludeAddress && account.id?.toLowerCase() === excludeAddress.toLowerCase()) {
      continue;
    }

    takenOn.push(chain);
    owner = account.id;
  }

  return {
    taken: takenOn.length > 0,
    chains: takenOn,
    owner,
  };
}

/**
 * Find an existing username for an address across ALL chains.
 * Returns the first username found (they should be consistent).
 *
 * @param {string} address - Wallet address to look up
 * @returns {Promise<{ username: string|null, chain: string|null }>}
 */
export async function findUsernameAcrossChains(address) {
  const sources = getAllSubgraphUrls();
  const id = address.toLowerCase();

  const query = `
    query FindUsername($id: Bytes!) {
      account(id: $id) {
        id
        username
      }
    }
  `;

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const res = await fetch(source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id } }),
      });
      const json = await res.json();
      return { chain: source.name, username: json?.data?.account?.username || null };
    })
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { chain, username } = result.value;
    if (username && username.trim().length > 0) {
      return { username, chain };
    }
  }

  return { username: null, chain: null };
}

/**
 * Search for a user by username across ALL chains.
 * Returns the first match found with chain info.
 *
 * @param {string} username - Username to search for
 * @returns {Promise<{ address: string|null, username: string|null, chain: string|null }>}
 */
export async function findUserByUsernameAcrossChains(username) {
  const sources = getAllSubgraphUrls();
  const trimmed = username.trim().toLowerCase();

  const query = `
    query FindUser($username: String!) {
      accounts(where: { username: $username }, first: 1) {
        id
        user
        username
      }
    }
  `;

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const res = await fetch(source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { username: trimmed } }),
      });
      const json = await res.json();
      return { chain: source.name, account: json?.data?.accounts?.[0] || null };
    })
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { chain, account } = result.value;
    if (account) {
      return { address: account.id, username: account.username, chain };
    }
  }

  return { address: null, username: null, chain: null };
}

/**
 * Find a user's profile by username across ALL chains.
 * Returns address, canonical username, and profile metadata in one query.
 *
 * @param {string} username - Username to search for
 * @returns {Promise<{ address: string|null, username: string|null, metadata: Object|null }>}
 */
export async function findUserProfileByUsername(username) {
  const sources = getAllSubgraphUrls();
  const trimmed = username.trim().toLowerCase();

  const query = `
    query FindUserProfile($username: String!) {
      accounts(where: { username: $username }, first: 1) {
        id
        user
        username
        metadata {
          bio
          avatar
          github
          twitter
          website
        }
      }
    }
  `;

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const res = await fetch(source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { username: trimmed } }),
      });
      const json = await res.json();
      return json?.data?.accounts?.[0] || null;
    })
  );

  // Collect all valid accounts and pick the metadata with the most fields populated.
  // Profile may be updated on one chain but not another — prefer the richest version.
  let bestResult = null;
  let bestRichness = -1;

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const account = result.value;
    const meta = account.metadata;
    let richness = 0;
    if (meta) {
      if (meta.bio) richness++;
      if (meta.avatar) richness++;
      if (meta.github) richness++;
      if (meta.twitter) richness++;
      if (meta.website) richness++;
    }
    if (!bestResult || richness > bestRichness) {
      bestResult = account;
      bestRichness = richness;
    }
  }

  if (bestResult) {
    return {
      address: bestResult.id,
      username: bestResult.username,
      metadata: bestResult.metadata || null,
    };
  }

  return { address: null, username: null, metadata: null };
}

/**
 * Find a user's profile by address across ALL chains.
 * Returns canonical username and profile metadata, picking the richest version
 * across chains (profile may be updated on one chain but not another).
 *
 * @param {string} address - Wallet address to look up
 * @returns {Promise<{ address: string|null, username: string|null, metadata: Object|null, sourceChain: string|null, sourceChainId: number|null }>}
 */
export async function findUserProfileByAddress(address) {
  if (!address) {
    return { address: null, username: null, metadata: null, sourceChain: null, sourceChainId: null };
  }
  const sources = getAllSubgraphUrls();
  const id = address.toLowerCase();

  const query = `
    query FindUserProfileByAddress($id: Bytes!) {
      account(id: $id) {
        id
        username
        metadata {
          bio
          avatar
          github
          twitter
          website
        }
      }
    }
  `;

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const res = await fetch(source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id } }),
      });
      const json = await res.json();
      return { source, account: json?.data?.account || null };
    })
  );

  // Pick richest metadata. Tie-break: prefer the home chain (Arbitrum).
  let best = null;
  let bestRichness = -1;
  let bestIsHome = false;

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value?.account) continue;
    const { source, account } = result.value;
    const meta = account.metadata;
    let richness = 0;
    if (account.username) richness++;
    if (meta) {
      if (meta.bio) richness++;
      if (meta.avatar) richness++;
      if (meta.github) richness++;
      if (meta.twitter) richness++;
      if (meta.website) richness++;
    }
    const isHome = source.chainId === DEFAULT_CHAIN_ID;
    const beats =
      richness > bestRichness ||
      (richness === bestRichness && isHome && !bestIsHome);
    if (!best || beats) {
      best = { account, source };
      bestRichness = richness;
      bestIsHome = isHome;
    }
  }

  if (best) {
    return {
      address: best.account.id,
      username: best.account.username || null,
      metadata: best.account.metadata || null,
      sourceChain: best.source.name,
      sourceChainId: best.source.chainId,
    };
  }

  return { address: null, username: null, metadata: null, sourceChain: null, sourceChainId: null };
}

/**
 * Batch variant of findUserProfileByAddress: fetches profiles for many addresses
 * across all chains in parallel. Returns a Map<lowerAddress, profileRecord>.
 *
 * @param {string[]} addresses
 * @returns {Promise<Map<string, { username: string|null, metadata: Object|null, sourceChain: string|null, sourceChainId: number|null }>>}
 */
export async function findUserProfilesByAddresses(addresses) {
  const map = new Map();
  if (!Array.isArray(addresses) || addresses.length === 0) return map;

  const sources = getAllSubgraphUrls();
  const ids = Array.from(new Set(addresses.map(a => a?.toLowerCase()).filter(Boolean)));
  if (ids.length === 0) return map;

  const query = `
    query FindUserProfilesByAddresses($ids: [Bytes!]!) {
      accounts(where: { id_in: $ids }, first: 1000) {
        id
        username
        metadata {
          bio
          avatar
          github
          twitter
          website
        }
      }
    }
  `;

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const res = await fetch(source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { ids } }),
      });
      const json = await res.json();
      return { source, accounts: json?.data?.accounts || [] };
    })
  );

  const richness = (account) => {
    let r = 0;
    if (account.username) r++;
    const m = account.metadata;
    if (m) {
      if (m.bio) r++;
      if (m.avatar) r++;
      if (m.github) r++;
      if (m.twitter) r++;
      if (m.website) r++;
    }
    return r;
  };

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { source, accounts } = result.value;
    const isHome = source.chainId === DEFAULT_CHAIN_ID;
    for (const account of accounts) {
      const key = account.id?.toLowerCase();
      if (!key) continue;
      const next = {
        username: account.username || null,
        metadata: account.metadata || null,
        sourceChain: source.name,
        sourceChainId: source.chainId,
      };
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...next, _richness: richness(account), _isHome: isHome });
        continue;
      }
      const nextRichness = richness(account);
      const beats =
        nextRichness > prev._richness ||
        (nextRichness === prev._richness && isHome && !prev._isHome);
      if (beats) {
        map.set(key, { ...next, _richness: nextRichness, _isHome: isHome });
      }
    }
  }

  // Strip internal scoring fields before returning
  for (const [key, value] of map.entries()) {
    delete value._richness;
    delete value._isHome;
  }

  return map;
}

/**
 * Find all organization memberships for an address across ALL chains.
 *
 * Each entry's `firstSeenAt` is a unix-seconds string (subgraph BigInt) and
 * `organization.metadata` is the indexed metadata object containing `logo`
 * (IPFS CID) and `description`. `metadataHash` is retained as a fallback for
 * subgraphs that have not indexed the metadata entity.
 *
 * @param {string} address - Wallet address
 * @returns {Promise<Array<{
 *   id: string,
 *   membershipStatus: string,
 *   participationTokenBalance: string,
 *   totalTasksCompleted: number,
 *   totalVotes: number,
 *   firstSeenAt: string | null,
 *   organization: {
 *     id: string,
 *     name: string,
 *     metadataHash: string,
 *     metadata: { id: string, logo: string, description: string } | null,
 *     participationToken: { symbol: string }
 *   }
 * }>>}
 */
export async function findUserOrgsAcrossChains(address) {
  const sources = getAllSubgraphUrls();

  const query = `
    query FetchUserOrgs($userAddress: Bytes!) {
      users(where: { address: $userAddress, membershipStatus: Active }) {
        id
        membershipStatus
        participationTokenBalance
        totalTasksCompleted
        totalVotes
        firstSeenAt
        organization {
          id
          name
          metadataHash
          metadata {
            id
            logo
            description
          }
          participationToken { symbol }
        }
      }
    }
  `;

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const res = await fetch(source.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { userAddress: address.toLowerCase() } }),
      });
      const json = await res.json();
      return json?.data?.users || [];
    })
  );

  const orgs = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    orgs.push(...result.value);
  }
  return orgs;
}
