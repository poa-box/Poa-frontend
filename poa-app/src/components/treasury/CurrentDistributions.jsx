import { useUserContext } from '@/context/UserContext';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  VStack,
  Text,
  Box,
} from '@chakra-ui/react';
import { FiInbox } from 'react-icons/fi';
import { INK } from './treasuryStyles';
import { gql } from '@apollo/client';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { useAuth } from '@/context/authState';
import { useIPFScontext } from '@/context/ipfsContext';
import { RefreshEvent } from '@/context/RefreshContext';
import { usePOContext } from '@/context/POContext';
import { verifyDistributionClaimsDocument, findDistributionClaim, parseDistributionClaimsDiscoveryMarker } from '@poa-box/core/metadata/distribution';
import { useSubgraphClient } from '@/util/apolloClient';
import DistributionCard from './DistributionCard';

const EMPTY_PROPOSALS = Object.freeze([]);

/**
 * Extract IPFS CID from a proposal description that contains "Merkle tree: ipfs://QmXxx..."
 */
function extractTreeCid(description) {
  if (!description) return null;
  const match = description.match(/ipfs:\/\/(Qm[A-Za-z0-9]{44})/);
  return match ? match[1] : null;
}

/**
 * Find all tree CIDs from executed proposals.
 * Returns array of { cid, rootInDesc } where rootInDesc is the merkle root
 * found in the description (if present), or null for older proposals.
 */
function extractAllTreeCids(proposals) {
  if (!proposals) return [];
  const results = [];
  for (const proposal of proposals) {
    const desc = proposal.metadata?.description || '';
    const parsed = parseDistributionClaimsDiscoveryMarker(desc);
    if (parsed.state === 'known') { results.push({ cid: parsed.value.cid, rootInDesc: parsed.value.merkleRoot.toLowerCase() }); continue; }
    if (parsed.code === 'AMBIGUOUS_CLAIM_REFERENCE') continue;
    // Older executed proposals omitted the root hint; retain their CID discovery only.
    const cid = extractTreeCid(desc);
    if (!cid) continue;
    // Check if the description also contains "Root: 0x..."
    const rootMatch = desc.match(/Root:\s*(0x[a-fA-F0-9]{64})/);
    results.push({ cid, rootInDesc: rootMatch ? rootMatch[1].toLowerCase() : null });
  }
  return results;
}

/**
 * Find the tree CID for a distribution by matching its merkleRoot.
 * New proposals include "Root: 0x..." in the description for fast matching.
 * For older proposals without the root, returns all CIDs for the caller to verify.
 */
function findTreeCidForDistribution(distribution, treeCids) {
  if (!distribution?.merkleRoot || !treeCids.length) return null;
  const rootHex = distribution.merkleRoot.toLowerCase();

  // Fast path: match by root in description
  const exactMatch = treeCids.find(t => t.rootInDesc === rootHex);
  if (exactMatch) return exactMatch.cid;

  // Slow path: return all CIDs without root info (caller must fetch and verify)
  return treeCids.filter(t => !t.rootInDesc).map(t => t.cid);
}

const CurrentDistributions = ({
  distributions = [],
  paymentManagerAddress,
  hybridVotingId,
  subgraphUrl,
  refetch,
}) => {
  const { orgId, orgChainId } = usePOContext();
  const { treasury, executeWithNotification, isReady } = useWeb3();
  const { accountAddress } = useAuth();
  const { isAccountReady, userDataLoading } = useUserContext();
  const accountPending = isAccountReady === false || userDataLoading;
  const { safeFetchFromIpfs } = useIPFScontext();

  const client = useSubgraphClient(subgraphUrl);

  const [references, setReferences] = useState({ scope: null, proposals: [], error: null });
  const referenceScope = [orgId, orgChainId, subgraphUrl, hybridVotingId, distributions.length > 0].join(':');
  useEffect(() => {
    let active = true;
    if (!orgId || !orgChainId || !subgraphUrl || !hybridVotingId || !distributions.length) return;
    const read = async () => {
      try {
        const { readDistributionReferences } = await import('@poa-box/core/reads/treasury');
        const head = await client.query({ query: gql`query DistributionReferenceHead { _meta { block { number hash } hasIndexingErrors } }`, fetchPolicy: 'network-only' });
        const meta = head.data?._meta;
        if (head.errors?.length || meta?.hasIndexingErrors || !Number.isSafeInteger(meta?.block?.number)) throw new Error('Payout references unavailable');
        const facts = await readDistributionReferences({ source: { chainId: orgChainId, orgId, contract: hybridVotingId,
          endpoint: subgraphUrl, method: 'graphql', indexed: true, snapshot: 'pinned',
          block: { number: String(meta.block.number), ...(meta.block.hash ? { hash: meta.block.hash } : {}) } },
          pageSize: 500, maxPages: 10, query: async (document, variables) => {
            const response = await client.query({ query: gql(document), variables, fetchPolicy: 'network-only' });
            if (response.errors?.length) throw new Error('Payout references unavailable');
            return response.data;
          } });
        if (facts.coverage.status !== 'complete') throw new Error('Payout references incomplete');
        if (active) setReferences({ scope: referenceScope, proposals: facts.data.map(row => row.proposal), error: null });
      } catch (error) { if (active) setReferences({ scope: referenceScope, proposals: [], error }); }
    };
    read();
    return () => { active = false; };
  }, [client, orgId, orgChainId, subgraphUrl, hybridVotingId, distributions.length, referenceScope]);
  const proposals = references.scope === referenceScope ? references.proposals : EMPTY_PROPOSALS;
  const treeCids = React.useMemo(() => extractAllTreeCids(proposals), [proposals]);

  // Scope includes immutable distribution facts so an old account/root can never reuse claims.
  const scopeKey = JSON.stringify([orgId, orgChainId, subgraphUrl, paymentManagerAddress, hybridVotingId, accountAddress, accountPending,
    distributions.map(d => [d.distributionId, d.merkleRoot, d.payoutToken, d.totalAmount, d.checkpointBlock])]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const [claimState, setClaimState] = useState({ scope: null, data: {} });
  const claimDataMap = claimState.scope === scopeKey ? claimState.data : {};

  const fetchClaimData = useCallback(async distribution => {
    const result = findTreeCidForDistribution(distribution, treeCids);
    const cids = typeof result === 'string' ? [result] : result || [];
    if (!cids.length) return 'error'; // Missing discovery is unknown, not known exclusion.
    for (const cid of cids) {
      let document;
      try { document = await safeFetchFromIpfs(cid); } catch { continue; }
      const verified = verifyDistributionClaimsDocument(document, { loadedCid: cid, reference: {
        chainId: orgChainId, orgId, paymentManager: paymentManagerAddress, distributionId: String(distribution.distributionId),
        cid, merkleRoot: distribution.merkleRoot, token: distribution.payoutToken,
        totalAmount: distribution.totalAmount, checkpointBlock: String(distribution.checkpointBlock),
      } });
      if (verified.state !== 'known') continue;
      const claim = findDistributionClaim(verified, accountAddress);
      if (claim.state !== 'known') return 'error';
      return claim.value || 'not-found';
    }
    return 'error';
  }, [treeCids, safeFetchFromIpfs, orgChainId, orgId, paymentManagerAddress, accountAddress]);

  useEffect(() => {
    let active = true;
    if (!accountAddress || accountPending) { setClaimState({ scope: scopeKey, data: {} }); return; }
    if (!treeCids.length) {
      setClaimState({ scope: scopeKey, data: Object.fromEntries(distributions.map(d => [d.distributionId,
        references.scope === referenceScope ? 'error' : 'loading'])) });
      return;
    }
    const pending = distributions.filter(d => !d.claims?.some(c => c.claimer?.toLowerCase() === accountAddress.toLowerCase()));
    setClaimState({ scope: scopeKey, data: Object.fromEntries(pending.map(d => [d.distributionId, 'loading'])) });
    pending.forEach(async distribution => {
      const value = await fetchClaimData(distribution);
      if (active && scopeRef.current === scopeKey) setClaimState(prev => ({ scope: scopeKey,
        data: { ...prev.data, [distribution.distributionId]: value } }));
    });
    return () => { active = false; };
  }, [scopeKey, distributions, treeCids, accountAddress, accountPending, fetchClaimData, references.scope, referenceScope]);

  // Handle claim
  const handleClaim = async (distributionId) => {
    const claimData = claimDataMap[distributionId];
    if (!claimData || typeof claimData === 'string') {
      throw new Error('Claim data not available. Please try refreshing the page.');
    }

    if (!treasury || !isReady) {
      throw new Error('Still getting things ready. Give it a moment, then try again.');
    }

    const result = await executeWithNotification(
      async () => {
        if (scopeRef.current !== scopeKey) throw new Error('Your account or organization changed. Try again.');
        const alreadyClaimed = await treasury.hasClaimed(paymentManagerAddress, distributionId, accountAddress);
        if (scopeRef.current !== scopeKey) throw new Error('Your account or organization changed. Try again.');
        if (alreadyClaimed) { refetch?.(); throw new Error('You have already claimed this payout.'); }
        return treasury.claimDistribution(
        paymentManagerAddress,
        distributionId,
        claimData.amount,
        claimData.proof
      );
      },
      {
        pendingMessage: 'Claiming your distribution share...',
        successMessage: 'Distribution claimed successfully!',
        refreshEvent: RefreshEvent.TREASURY_DEPOSITED,
      }
    );

    if (scopeRef.current !== scopeKey) return;
    if (result.success) {
      refetch?.();
    } else {
      throw new Error('We couldn’t claim your share. Please try again.');
    }
  };

  if (accountPending) {
    return <Text py={8} color={INK.secondary} textAlign="center" fontSize="sm" role="status">Getting your payout details ready…</Text>;
  }

  if (distributions.length === 0) {
    return (
      <VStack py={8} spacing={3}>
        <Box p={4} borderRadius="full" bg="rgba(144, 85, 232, 0.08)">
          <FiInbox size={28} color="rgba(144, 85, 232, 0.5)" />
        </Box>
        <Text color={INK.secondary} textAlign="center" fontSize="sm">
          No payouts to claim right now
        </Text>
        <Text fontSize="xs" color={INK.muted} textAlign="center" maxW="360px">
          When the group approves one, your share appears here.
        </Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={0} align="stretch">
      {distributions.map((distribution) => {
        const distId = distribution.distributionId;
        const rawClaim = claimDataMap[distId];
        const claimData = rawClaim && typeof rawClaim === 'object' ? rawClaim : null;
        const isLoadingClaim = rawClaim === 'loading';
        const claimNotFound = rawClaim === 'not-found';
        const claimError = rawClaim === 'error';

        return (
          <DistributionCard
            key={distribution.id}
            distribution={distribution}
            paymentManagerAddress={paymentManagerAddress}
            refetch={refetch}
            onClaim={handleClaim}
            claimData={claimData}
            isLoadingClaim={isLoadingClaim}
            claimNotFound={claimNotFound}
            claimError={claimError}
          />
        );
      })}
    </VStack>
  );
};

export default CurrentDistributions;
