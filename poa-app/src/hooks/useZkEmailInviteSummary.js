/**
 * useZkEmailInviteSummary — shared state machine for surfacing an org's email-invite allowlist.
 *
 * Reads the ACTIVE allowlist commitment straight from the org's chain (a public read-only RPC, so it
 * works for visitors with no wallet connected — the join page's primary audience), fetches the
 * allowlist file from IPFS, verifies it against the on-chain merkle root, and maps each entry's
 * hatIds to human-readable role names.
 *
 * Status matrix (every consumer must handle all of these):
 *   'absent'   — org has no ZkEmailInvites module (or POContext still loading it). Render nothing.
 *   'loading'  — on-chain/IPFS reads in flight. Render nothing or a spinner — never actionable UI.
 *   'dormant'  — module deployed but no allowlist activated (root == 0). Claims would revert
 *                AllowlistNotActive, so surfaces must say "not activated yet", never show an upload.
 *   'active'   — allowlist live + file verified against the on-chain root. `domains`/`emailCount`
 *                /`roleNames` are trustworthy (entries come from the root-matched file).
 *   'degraded' — allowlist PROVABLY live on-chain (root != 0) but the file is unavailable or does
 *                not match the root (IPFS lag, swapped CID). Generic "invites are active" copy with
 *                no entry details; claiming may still work (the claim path re-fetches).
 *   'unknown'  — the on-chain read itself failed (RPC outage): liveness is NOT known. Surfaces must
 *                not advertise claimability (a dormant module would look identical). Offer a retry.
 *
 * Results are stamped with an (address, chain) key: switching orgs on the same route resets the
 * state synchronously instead of showing the previous org's verified data. Role-name mapping happens
 * at render time (useMemo), so POContext role refreshes never re-trigger the network reads.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { getNetworkByChainId } from '@/config/networks';
import { assertRootMatches } from '@/lib/zkemail/allowlist';

const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000';
const READ_ABI = [
  'function merkleRoot() view returns (bytes32)',
  'function allowlistCid() view returns (bytes32)',
];

const EMPTY = { status: 'absent', key: '', rawDomains: [], rawEmailHats: [], emailCount: 0 };

/** Normalize any hat-id representation (hex or decimal string) to a canonical decimal string. */
function hatKey(id) {
  try {
    return BigInt(String(id).trim()).toString();
  } catch (_) {
    return '';
  }
}

export function useZkEmailInviteSummary() {
  const { zkEmailInvitesAddress, zkEmailInvitesEnabled, orgChainId, roleNames: contextRoleNames } = usePOContext();
  const { safeFetchFromIpfs, bytes32ToIpfsCid } = useIPFScontext();

  const [state, setState] = useState(EMPTY);
  const [tick, setTick] = useState(0); // bumped by refresh() — re-runs the reads for dormant/degraded/unknown
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const key = `${String(zkEmailInvitesAddress || '').toLowerCase()}:${orgChainId || ''}`;

    if (!zkEmailInvitesEnabled || !zkEmailInvitesAddress) {
      setState({ ...EMPTY, key });
      return undefined;
    }
    const network = getNetworkByChainId(orgChainId);
    if (!network?.rpcUrl) {
      setState({ ...EMPTY, key });
      return undefined;
    }

    // Keep verified data only if it belongs to THIS org+chain — an org switch resets synchronously.
    setState((s) =>
      s.key === key && s.status === 'active' ? s : { status: 'loading', key, rawDomains: [], rawEmailHats: [], emailCount: 0 },
    );

    (async () => {
      let root;
      let cid;
      try {
        // 1. Active commitment from the org's chain (public RPC — no wallet needed).
        const provider = new ethers.providers.JsonRpcProvider(network.rpcUrl);
        const contract = new ethers.Contract(zkEmailInvitesAddress, READ_ABI, provider);
        [root, cid] = await Promise.all([contract.merkleRoot(), contract.allowlistCid()]);
      } catch (e) {
        // Chain read failed: liveness UNKNOWN (could be dormant) — never advertise claimability.
        if (alive) {
          console.warn('[zkemail] allowlist on-chain read failed:', e?.message);
          setState({ status: 'unknown', key, rawDomains: [], rawEmailHats: [], emailCount: 0 });
        }
        return;
      }
      if (!alive) return;

      if (!root || root === ZERO_ROOT) {
        setState({ status: 'dormant', key, rawDomains: [], rawEmailHats: [], emailCount: 0 });
        return;
      }

      try {
        // 2. Fetch + verify the allowlist file. Any failure → 'degraded' (never show unverified data).
        const doc = await safeFetchFromIpfs(bytes32ToIpfsCid(cid));
        if (!alive) return;
        if (!doc || !Array.isArray(doc.entries) || doc.entries.length === 0) {
          setState({ status: 'degraded', key, rawDomains: [], rawEmailHats: [], emailCount: 0 });
          return;
        }
        try {
          assertRootMatches(doc, root);
        } catch (e) {
          console.warn('[zkemail] allowlist file does not match the on-chain root:', e?.message);
          setState({ status: 'degraded', key, rawDomains: [], rawEmailHats: [], emailCount: 0 });
          return;
        }

        // 3. Collect verified entries. Domains are deduped (first entry wins — mirrors proofForDomain,
        //    which proves against the FIRST matching leaf, so we never advertise roles a claim
        //    wouldn't actually grant).
        const byDomain = new Map();
        const rawEmailHats = [];
        let emailCount = 0;
        for (const entry of doc.entries) {
          if (entry.type === 'domain' && entry.identifier) {
            const d = String(entry.identifier).toLowerCase();
            if (!byDomain.has(d)) byDomain.set(d, { domain: d, hatIds: entry.hatIds || [] });
          } else if (entry.type === 'email') {
            emailCount += 1;
            rawEmailHats.push(...(entry.hatIds || []));
          }
        }
        setState({ status: 'active', key, rawDomains: [...byDomain.values()], rawEmailHats, emailCount });
      } catch (e) {
        if (!alive) return;
        console.warn('[zkemail] allowlist summary failed:', e?.message);
        setState({ status: 'degraded', key, rawDomains: [], rawEmailHats: [], emailCount: 0 });
      }
    })();

    return () => {
      alive = false;
    };
  }, [zkEmailInvitesEnabled, zkEmailInvitesAddress, orgChainId, tick, safeFetchFromIpfs, bytes32ToIpfsCid]);

  // Render-time role-name mapping: POContext role refreshes update names WITHOUT re-running the
  // network reads (doc hatIds are hex; the subgraph uses decimal strings — bridge via BigInt).
  return useMemo(() => {
    const roleNameByHat = {};
    Object.entries(contextRoleNames || {}).forEach(([id, name]) => {
      const k = hatKey(id);
      if (k) roleNameByHat[k] = name;
    });
    const nameOf = (hatId) => roleNameByHat[hatKey(hatId)] || null;
    const allNames = new Set();
    const domains = state.rawDomains.map(({ domain, hatIds }) => {
      const names = (hatIds || []).map(nameOf).filter(Boolean);
      names.forEach((n) => allNames.add(n));
      return { domain, roleNames: names };
    });
    const emailHatKeySet = new Set(state.rawEmailHats.map(hatKey).filter(Boolean));
    const domainsByHatKey = new Map();
    state.rawDomains.forEach(({ domain, hatIds }) => {
      (hatIds || []).forEach((h) => {
        const k = hatKey(h);
        if (!k) return;
        if (!domainsByHatKey.has(k)) domainsByHatKey.set(k, []);
        domainsByHatKey.get(k).push(domain);
      });
    });
    /** Is a given role hat claimable via the ACTIVE allowlist? -> { claimable, byDomain, byEmail, domains } */
    const claimableInfoFor = (hatId) => {
      const k = hatKey(hatId);
      const ds = (k && domainsByHatKey.get(k)) || [];
      const byEmail = !!k && emailHatKeySet.has(k);
      return { claimable: ds.length > 0 || byEmail, byDomain: ds.length > 0, byEmail, domains: ds };
    };
    const firstClaimableHatKey = domainsByHatKey.keys().next().value || [...emailHatKeySet][0] || null;
    return {
      status: state.status,
      domains,
      emailCount: state.emailCount,
      roleNames: [...allNames],
      claimableInfoFor,
      firstClaimableHatKey,
      refresh,
    };
  }, [state, contextRoleNames, refresh]);
}

export default useZkEmailInviteSummary;
