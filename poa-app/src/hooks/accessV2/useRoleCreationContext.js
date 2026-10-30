import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { useWeb3Services } from '@/hooks/useWeb3Services';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { getNetworkByChainId } from '@/config/networks';
import { useIPFScontext } from '@/context/ipfsContext';
import { useAuthorityEvidence } from '@/hooks/accessV2/useAuthorityEvidence';
import { roleOperationQuery as apolloProtocolQuery } from '@/lib/accessV2/roleOperationQuery';
import { roleFormRequest } from '@/lib/accessV2/roleFormRequest';
import { useOrgAuthority } from '@/hooks/accessV2/useOrgAuthority';

import { roleContinuationScope } from '@/lib/accessV2/roleContinuationDraft';
const unavailableWorkflow = { activate() {}, dispose() {}, rows: () => [], ...Object.fromEntries(['review', 'submit', 'recover', 'capabilities'].map(name => [name, async () => { throw new Error('Current role settings could not be verified. Please wait for your account.'); }])) };
const pending = { ready: false, error: null };

/** React owns resolved identity and rendering; the same workflow also runs without React. */
export function useRoleCreationContext({ enabled, authority: authorityAddress }) {
  const authority = useOrgAuthority();
  const { accountAddress, isAuthHydrated, isAuthenticated } = useAuth();
  const { refetch: refetchAuthority } = useAuthorityEvidence();
  const { orgId, orgChainId, subgraphUrl, treasuryContractAddress: executor, zkEmailInvitesAddress,
    votingContractAddress: hybridVoting, taskManagerContractAddress: taskManagerAddress, participationTokenAddress,
    paymentManagerAddress, tokenLabel } = usePOContext();
  const services = useWeb3Services();
  const { addToIpfs, fetchFromIpfs } = useIPFScontext();
  const client = useSubgraphClient(subgraphUrl);
  const { data, error: infraError, refetch: refetchInfrastructure } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client, skip: !authority.enabled || !enabled || !subgraphUrl,
  });
  const orgRegistry = data?.poaManagerContracts?.[0]?.orgRegistryProxy || data?.orgRegistryContracts?.[0]?.id || '';
  const paymasterHub = data?.poaManagerContracts?.[0]?.paymasterHubProxy || '';
  const zkEmailAddress = /^0x0{40}$/i.test(zkEmailInvitesAddress || '') ? '' : zkEmailInvitesAddress;
  const nativeSymbol = getNetworkByChainId(orgChainId)?.nativeCurrency?.symbol || 'ETH';
  const identity = [orgChainId, orgId, subgraphUrl, authorityAddress, executor, hybridVoting, taskManagerAddress,
    participationTokenAddress, paymentManagerAddress, orgRegistry, paymasterHub, zkEmailAddress,
    enabled, authority.enabled, isAuthHydrated, isAuthenticated, accountAddress].join(':');
  const generation = useMemo(() => ({ identity }), [identity]);
  const current = useRef(generation); current.current = generation;
  const [revision, rerender] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const workflow = useMemo(() => {
    if (!services.roleCreation || !isAuthHydrated || !isAuthenticated || !accountAddress) return unavailableWorkflow;
    const assertCurrent = () => {
      if (current.current !== generation || !authority.enabled || !isAuthHydrated || !isAuthenticated || !accountAddress) {
        throw new Error('The organization or account changed. Review the role again.');
      }
    };
    const scope = roleContinuationScope({ chainId: orgChainId, orgId, authority: authorityAddress,
      hybridVoting, executor, account: isAuthHydrated && isAuthenticated ? accountAddress : null, endpoint: subgraphUrl });
    return services.roleCreation.createWorkflow({ scope, txManager: services.txManager, voting: services.voting,
      assertCurrent, canReview: enabled, changed: () => { if (current.current === generation) rerender(value => value + 1); },
      storage: () => typeof window === 'undefined' ? null : window.localStorage,
      display: { nativeSymbol, tokenLabel, fetchDocument: fetchFromIpfs, uploadDocument: addToIpfs },
      observe: async ({ signal }) => {
        const infrastructure = await refetchInfrastructure(); signal?.throwIfAborted(); assertCurrent();
        if (infrastructure.error) throw new Error('Current organization settings could not be verified.');
        const registry = infrastructure.data?.poaManagerContracts?.[0]?.orgRegistryProxy || infrastructure.data?.orgRegistryContracts?.[0]?.id || '';
        const paymaster = infrastructure.data?.poaManagerContracts?.[0]?.paymasterHubProxy || '';
        const contracts = Object.fromEntries(Object.entries({ membershipAuthority: authorityAddress, executor, hybridVoting,
          taskManager: taskManagerAddress, participationToken: participationTokenAddress, paymentManager: paymentManagerAddress,
          registry, paymaster, email: zkEmailAddress }).filter(([, address]) => address && !/^0x0{40}$/i.test(address)));
        const snapshot = await refetchAuthority(); signal?.throwIfAborted(); assertCurrent();
        return { snapshot, endpoint: subgraphUrl,
          scope: { chainId: orgChainId, orgId, contract: authorityAddress, contracts, account: accountAddress.toLowerCase() },
          request: roleFormRequest({ sponsorship: { enabled: false } }), query: apolloProtocolQuery,
          rpcEndpoint: getNetworkByChainId(orgChainId)?.rpcUrl };
      },
    });
  }, [generation, enabled, authority.enabled, isAuthHydrated, isAuthenticated, accountAddress, orgChainId, orgId,
    authorityAddress, hybridVoting, executor, subgraphUrl, services.roleCreation, services.txManager, services.voting,
    nativeSymbol, tokenLabel, fetchFromIpfs, addToIpfs, refetchInfrastructure, refetchAuthority, taskManagerAddress,
    participationTokenAddress, paymentManagerAddress, zkEmailAddress]);
  useEffect(() => { workflow.activate(); return () => workflow.dispose(); }, [workflow]);
  const optionsController = useRef(null);
  const refresh = useCallback(async (_form, { signal } = {}) => {
    if (current.current !== generation) throw new Error('The organization or account changed. Review the role again.');
    signal?.throwIfAborted();
    optionsController.current?.abort();
    const controller = new AbortController(); optionsController.current = controller;
    const cancel = () => controller.abort(); signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    setSnapshot(null);
    try {
      const operation = await workflow.capabilities({ signal: controller.signal });
      const value = capabilityDisplay(operation);
      if (current.current === generation && !controller.signal.aborted) setSnapshot({ generation, ...value });
      return value;
    } catch (error) {
      if (current.current === generation && !controller.signal.aborted) setSnapshot({ generation, error: 'Current organization settings could not be verified. Recheck sponsorship.' });
      throw error;
    } finally { signal?.removeEventListener('abort', cancel); }
  }, [workflow, generation]);
  const visible = snapshot?.generation === generation ? snapshot : null;
  const unavailable = visible?.error ? { ready: false, error: visible.error } : pending;
  return useMemo(() => { void revision; return ({ orgId, orgRegistry, paymasterHub, executor, zkEmailAddress, nativeSymbol,
    continuations: workflow.rows(), resolveContinuation: workflow.recover,
    submitRole: workflow.submit, reviewRoleConfiguration: workflow.review, refreshRoleCreation: refresh,
    sponsorshipConfig: { ...(visible?.sponsorshipConfig || unavailable), nativeSymbol },
    emailConfig: visible?.emailConfig || unavailable, metadataAdminSubject: visible?.metadataAdminSubject,
    configurationError: visible?.error || (infraError ? 'Could not load this org’s configuration.' : null),
  }); }, [orgId, orgRegistry, paymasterHub, executor, zkEmailAddress, nativeSymbol, workflow, refresh, visible, unavailable, infraError, revision]);
}
function capabilityDisplay(operation) {
  const contracts = operation.contracts;
  const options = operation.data.context.data;
    const sponsor = options.sponsorship, email = options.email;
    const knownBoolean = fact => fact?.state === 'known' && typeof fact.value === 'boolean';
    const sponsorshipReady = !contracts.paymaster || knownBoolean(sponsor?.operatorAuthorized);
    const emailReady = !contracts.email || ['enabled', 'authorityMatches', 'domainEnabled', 'emailEnabled'].every(key => knownBoolean(email?.[key]));
    return {
      sponsorshipConfig: { ready: sponsorshipReady,
        canConfigure: sponsorshipReady && sponsor?.operatorAuthorized?.value === true,
        claimBudgetReady: knownBoolean(sponsor?.claimBudgetExists),
        claimBudgetMissing: knownBoolean(sponsor?.claimBudgetExists) && sponsor.claimBudgetExists.value === false,
        error: !sponsorshipReady ? 'Current sponsorship settings could not be verified. Recheck sponsorship.'
          : !contracts.paymaster ? 'Sponsorship is not available for this organization.'
            : sponsor.operatorAuthorized.value ? null : 'The organization’s sponsor settings cannot be changed by this vote.' },
      emailConfig: { ready: emailReady, enabled: emailReady && email?.enabled?.value === true,
        authorityMatches: emailReady && email?.authorityMatches?.value === true,
        domainEnabled: emailReady && email?.domainEnabled?.value === true, emailEnabled: emailReady && email?.emailEnabled?.value === true,
        error: !emailReady ? 'Current email joining settings could not be verified. Recheck the organization settings.'
          : !email?.enabled?.value ? 'Email verification is not available for this organization.'
            : !email.authorityMatches.value ? 'Email joining is not connected to this organization’s current membership settings.' : null },
      metadataAdminSubject: options.registry?.currentAdminSubject?.state === 'known' ? options.registry.currentAdminSubject.value : undefined,
    };
}
