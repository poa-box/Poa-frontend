import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePOContext } from '@/context/POContext';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';

/** Detail reads are public and lazy; account/signing hydration never starts them. */
export function useMountedProposalDetail({ poll, isOpen, contractAddress }) {
  const { orgChainId, orgId, subgraphUrl } = usePOContext();
  const lane = poll?.type === 'Hybrid' ? 'hybrid' : 'dd';
  const proposalId = poll?.proposalId;
  const key = JSON.stringify([orgChainId, orgId, subgraphUrl, contractAddress, lane, proposalId]);
  const identity = useMemo(() => ({ key }), [key]);
  const [state, setState] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useRefreshSubscription([RefreshEvent.PROPOSAL_VOTED, RefreshEvent.PROPOSAL_COMPLETED], refresh, [refresh]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [isOpen, refresh]);
  const scope = useMemo(() => ({ chainId: orgChainId, orgId, endpoint: subgraphUrl, contract: contractAddress }),
    [orgChainId, orgId, subgraphUrl, contractAddress]);
  useEffect(() => {
    if (!isOpen || !scope.chainId || !scope.orgId || !scope.endpoint || !scope.contract || proposalId == null) return undefined;
    let current = true;
    setState(null);
    Promise.all([import('@/lib/voting/mountedProposalDetail'), import('@/lib/graphql/coreQuery')])
      .then(([{ readMountedProposalDetail }, { apolloProtocolQuery }]) => readMountedProposalDetail({
        query: apolloProtocolQuery, scope, lane, proposalId: String(proposalId),
      }))
      .then(evidence => { if (current) setState({ identity, evidence }); })
      .catch(() => { if (current) setState({ identity, evidence: null }); });
    return () => { current = false; };
  }, [isOpen, identity, scope, lane, proposalId, revision, poll?.totalVotes, poll?.status]);
  return isOpen && state?.identity === identity ? state.evidence : null;
}
