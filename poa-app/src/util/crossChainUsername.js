/**
 * Cross-chain username utilities
 *
 * Usernames are registered per-chain on UniversalAccountRegistry contracts.
 * These utilities query ALL mainnet subgraphs to ensure global uniqueness
 * and find existing usernames across chains.
 */

import { getAllSubgraphUrls } from '@/config/networks';

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
