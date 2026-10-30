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
import { createRoleReviewSession } from '@/lib/accessV2/roleReview';
import { assertRoleObservationActive } from '@/lib/accessV2/roleObservationWork';
import { normalizeRoleForm } from '@/lib/accessV2/roleFormBatch';
import { roleFormRequest } from '@/lib/accessV2/roleFormRequest';
import { requireRoleOperation } from '@/lib/accessV2/roleOperationHost';
import { roleContinuationScope, readRoleContinuations, saveRoleContinuation } from '@/lib/accessV2/roleContinuationDraft';
import { roleRecoveryIdentity, roleSubmissionIntent, sameRoleRecoveryAttempt, isRoleTransactionHash } from '@/lib/accessV2/roleSubmissionRecovery';
import { canAbandonSubmissionRecovery } from '@poa-box/core/execute/recovery';
import { parseCreatedProposalId } from '@/lib/voting/proposalReceipt';
import { utils } from 'ethers';
import { useOrgAuthority } from '@/hooks/accessV2/useOrgAuthority';

const pending = { ready: false, error: null };
const roleDraftKey = form => {
  const draft = { ...normalizeRoleForm(form) }; delete draft.continuationId;
  return utils.id(JSON.stringify(draft));
};

/** Shared live configuration for both v2 role-creation entry points. */
export function useRoleCreationContext({ enabled, authority: authorityAddress }) {
  const authority = useOrgAuthority();
  const { accountAddress, isAuthHydrated, isAuthenticated } = useAuth();
  const authorityObservation = useAuthorityEvidence();
  const refetchAuthority = authorityObservation.refetch;
  const { orgId, orgChainId, subgraphUrl, treasuryContractAddress: executor, zkEmailInvitesAddress, votingContractAddress: hybridVoting, taskManagerContractAddress: taskManagerAddress, participationTokenAddress, paymentManagerAddress, tokenLabel } = usePOContext();
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
  const identity = [orgChainId, orgId, subgraphUrl, authorityAddress, executor, hybridVoting, taskManagerAddress, participationTokenAddress, paymentManagerAddress, orgRegistry, paymasterHub, zkEmailAddress].join(':');
  const [snapshot, setSnapshot] = useState(null);
  const reviewIdentity = [identity, enabled, authority.enabled, isAuthHydrated, isAuthenticated, isAuthHydrated && isAuthenticated ? accountAddress : ''].join(':');
  const reviewScope = useMemo(() => ({ key: reviewIdentity, active: true, controllers: new Set() }), [reviewIdentity]);
  const currentIdentity = useRef(reviewScope);
  currentIdentity.current = reviewScope;
  useEffect(() => {
    reviewScope.active = true;
    return () => {
      reviewScope.active = false;
      for (const controller of reviewScope.controllers) controller.abort();
      reviewScope.controllers.clear();
    };
  }, [reviewScope]);
  const continuationScope = useMemo(() => roleContinuationScope({ chainId: orgChainId, orgId, authority: authorityAddress,
    hybridVoting, executor, account: isAuthHydrated && isAuthenticated ? accountAddress : null, endpoint: subgraphUrl }),
  [orgChainId, orgId, authorityAddress, hybridVoting, executor, accountAddress, isAuthHydrated, isAuthenticated, subgraphUrl]);
  const [saved, setSaved] = useState({ scope: null, rows: [] });
  const storage = () => typeof window === 'undefined' ? null : window.localStorage;
  const reloadContinuations = useCallback(() => {
    const rows = readRoleContinuations(storage(), continuationScope);
    setSaved({ scope: continuationScope, rows });
    return rows;
  }, [continuationScope]);
  useEffect(() => { reloadContinuations(); }, [reloadContinuations]);
  const assertContinuationCurrent = useCallback(() => {
    if (currentIdentity.current !== reviewScope || !reviewScope.active || !authority.enabled || !continuationScope) {
      throw new Error('The organization or account changed. Open your saved role again.');
    }
  }, [reviewScope, authority.enabled, continuationScope]);
  const saveContinuation = useCallback(row => {
    const result = saveRoleContinuation(storage(), continuationScope, row);
    reloadContinuations(); return result;
  }, [continuationScope, reloadContinuations]);
  const resolveContinuation = useCallback(async (id, { signal } = {}) => {
    assertContinuationCurrent();
    const parentSignal = signal;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    parentSignal?.addEventListener('abort', cancel, { once: true });
    if (parentSignal?.aborted) controller.abort();
    signal = controller.signal;
    reviewScope.controllers.add(controller);
    try {
    assertRoleObservationActive(signal);
    let row = readRoleContinuations(storage(), continuationScope).find(row => row.id === id);
    if (!row) throw new Error('This saved role is unavailable for the current account and organization.');
    const persistStage = (field, stage) => {
      // Persist under the captured scope even if navigation happened during a read.
      // Never replace a newer attempt with an older completion.
      const current = readRoleContinuations(storage(), continuationScope).find(value => value.id === id);
      if (!current || current[field]?.attemptId !== row[field]?.attemptId) throw new Error('The saved vote changed. Reopen its status.');
      const previous = current[field];
      const next = { ...previous, ...stage,
        ...(['created', 'executed', 'failed', 'rejected'].includes(previous.status) && ['submitting', 'uncertain', 'pending'].includes(stage.status)
          ? { status: previous.status } : {}) };
      row = saveContinuation({ ...current, [field]: next });
      return next;
    };
    const recoverStage = async field => {
      let stage = row[field];
      if (stage.recoveryInvalid) throw new Error('The saved vote identity does not match this request. No new vote was sent.');
      if (stage.transportOutcome === 'not-submitted' || ['failed', 'replaced'].includes(stage.transportOutcome)) return stage;
      if (stage.transactionHash && (!stage.submission || stage.transportOutcome === 'succeeded')) return stage;
      let submission = stage.submission;
      let matchesPending = false;
      const pending = services.txManager?.getPendingSubmission?.();
      if (pending) {
        let candidate;
        try { candidate = roleRecoveryIdentity(pending, continuationScope, stage.expectedIntentKey); } catch { /* Unrelated account action. */ }
        if (candidate && (!submission || sameRoleRecoveryAttempt(candidate, submission) && candidate.recovery.revision >= submission.recovery.revision)) {
          submission = candidate; matchesPending = true;
        }
      }
      if (!submission) throw new Error('The earlier submission is still unconfirmed. Check its status in your account before trying again.');
      // Save the exact unsigned lookup identity BEFORE the manager may clear its journal.
      stage = persistStage(field, { ...stage, submission });
      let recovered;
      if (matchesPending) {
        recovered = await services.txManager.reconcileSubmission(pending);
      } else {
        // Another recovery surface can already have removed the account journal.
        // This existing adapter delegates all outcome/nonce/canonical checks to core.
        const { reconcileUserOperationSubmission } = await import('@/services/web3/core/userOperationSubmission');
        assertRoleObservationActive(signal); assertContinuationCurrent();
        recovered = await reconcileUserOperationSubmission(submission, services.txManager?.bundlerClient, services.txManager?.publicClient);
      }
      const transactionHash = recovered.receipt?.transactionHash || recovered.outcome?.txHash;
      // A receipt remains a hint until exact role proof. Persist before ANY fallible read/guard.
      stage = persistStage(field, { ...stage,
        ...(isRoleTransactionHash(transactionHash) ? { transactionHash } : {}),
        ...(recovered.outcome?.status === 'succeeded' ? { transportOutcome: 'succeeded' } : {}),
        ...(['failed', 'replaced'].includes(recovered.outcome?.status)
          ? { status: 'failed', failureKind: 'submission', transportOutcome: recovered.outcome.status } : {}) });
      assertRoleObservationActive(signal); assertContinuationCurrent();
      if (!['succeeded', 'failed', 'replaced'].includes(recovered.outcome?.status)
        || !stage.transactionHash && stage.status !== 'failed') throw new Error('The earlier submission is still unconfirmed. No new vote was sent.');
      return stage;
    };
    let creation = await recoverStage('creation');
    if (creation.transportOutcome === 'not-submitted' || ['failed', 'replaced'].includes(creation.transportOutcome)) {
      return { ...row, proof: { state: 'failed' } };
    }
    const snapshot = await refetchAuthority();
    assertRoleObservationActive(signal); assertContinuationCurrent();
    const creationResult = await services.roleCreation.getRoleContinuation({ snapshot, endpoint: subgraphUrl,
      scope: { chainId: orgChainId, orgId, contract: authorityAddress, account: accountAddress.toLowerCase(),
        contracts: { membershipAuthority: authorityAddress, executor, hybridVoting } },
      creation, query: apolloProtocolQuery, signal });
    assertRoleObservationActive(signal); assertContinuationCurrent();
    if (creationResult.status !== 'ready' && creationResult.observations?.creation?.state === 'known') {
      const partial = creationResult.observations.creation.value;
      persistStage('creation', { status: partial.state, proposalId: partial.proposalId, transactionHash: partial.creationTransactionHash });
    }
    const proof = requireRoleOperation(creationResult).creation;
    // Preserve exact creation proof before starting independent configuration recovery.
    creation = persistStage('creation', { ...creation, status: proof.state, proposalId: proof.proposalId,
      transactionHash: proof.creationTransactionHash, ...(proof.state === 'failed' ? { failureKind: 'execution' } : {}) });
    let configuration = row.configuration;
    if (configuration) {
      configuration = await recoverStage('configuration');
      if (configuration.transportOutcome !== 'not-submitted' && !['failed', 'replaced'].includes(configuration.transportOutcome)) {
      const contracts = Object.fromEntries(Object.entries({ membershipAuthority: authorityAddress,
        executor, hybridVoting, taskManager: taskManagerAddress, participationToken: participationTokenAddress,
        paymentManager: paymentManagerAddress, registry: orgRegistry, paymaster: paymasterHub, email: zkEmailAddress,
      }).filter(([, address]) => address && !/^0x0{40}$/i.test(address)));
      const status = await services.roleCreation.getRoleContinuation({ snapshot, endpoint: subgraphUrl,
        scope: { chainId: orgChainId, orgId, contract: authorityAddress, account: accountAddress.toLowerCase(),
          contracts }, creation, configuration,
        query: apolloProtocolQuery, fetchDocument: fetchFromIpfs, signal });
      assertRoleObservationActive(signal); assertContinuationCurrent();
      const outcome = requireRoleOperation(status).configuration;
      if (!outcome) throw new Error('The saved configuration status is unavailable. Try again.');
      configuration = { ...configuration, status: outcome.state, proposalId: outcome.proposalId, transactionHash: outcome.creationTransactionHash,
        ...(outcome.state === 'failed' ? { failureKind: 'execution' } : {}) };
      }
    }
    const updated = configuration ? { ...row, configuration: persistStage('configuration', configuration) } : row;
    return { ...updated, proof, snapshot };
    } finally { parentSignal?.removeEventListener('abort', cancel); reviewScope.controllers.delete(controller); }

  }, [reviewScope, assertContinuationCurrent, continuationScope, services.txManager, services.roleCreation, refetchAuthority,
    orgChainId, orgId, authorityAddress, accountAddress, executor, hybridVoting, saveContinuation, subgraphUrl, fetchFromIpfs,
    taskManagerAddress, participationTokenAddress, paymentManagerAddress, orgRegistry, paymasterHub, zkEmailAddress]);
  const beginRoleSubmission = useCallback((built, form) => {
    assertContinuationCurrent();
    if (built.stage === 'compound') return null;
    const rows = readRoleContinuations(storage(), continuationScope);
    const existing = form.continuationId && rows.find(row => row.id === form.continuationId);
    const normalized = normalizeRoleForm(form);
    const draftKey = roleDraftKey(normalized);
    if (built.stage === 'create' && (existing && !['failed', 'rejected'].includes(existing.creation.status)
      || rows.some(row => (row.draftKey === draftKey || roleDraftKey(row.form) === draftKey)
        && !['failed', 'rejected'].includes(row.creation.status)))) {
      throw new Error('This role already has a saved vote. Use Finish configuration to check its status.');
    }
    if (built.stage === 'existing' && (!existing || existing.configuration && !['failed', 'rejected'].includes(existing.configuration.status))) {
      throw new Error('This configuration already has a saved submission. Check its status before trying again.');
    }
    const id = built.stage === 'existing' ? existing.id : globalThis.crypto.randomUUID();
    const attemptId = globalThis.crypto.randomUUID();
    const row = built.stage === 'create' ? { id, form: normalized, originalForm: structuredClone(normalized), draftKey, requiresConfiguration: built.requiresConfiguration,
      creation: { status: 'submitting', attemptId, transportStarted: false, call: { target: built.batch[0].target, value: built.batch[0].value, calldata: built.batch[0].data } } }
      : { ...existing, form: normalized, configurationHistory: [...(existing.configurationHistory || []), ...(existing.configuration ? [existing.configuration] : [])],
        configuration: { status: 'submitting', attemptId, transportStarted: false, batch: built.batch.map(call => ({ target: call.target, value: call.value, calldata: call.data })) } };
    saveContinuation(row);
    return { id, stage: built.stage, scope: continuationScope, attemptId };
  }, [assertContinuationCurrent, continuationScope, saveContinuation]);
  const finishRoleSubmission = useCallback((ticket, result) => {
    if (!ticket) return;
    // Completion may arrive after the modal closes. Store only under the captured scope.
    const row = readRoleContinuations(storage(), ticket.scope).find(row => row.id === ticket.id);
    if (!row) throw new Error('The saved role could not be found. Keep the submission receipt.');
    const field = ticket.stage === 'create' ? 'creation' : 'configuration';
    if (row[field]?.attemptId !== ticket.attemptId) throw new Error('The saved role submission changed.');
    const proposalId = parseCreatedProposalId(result?.receipt, ticket.scope.hybridVoting);
    const rawHash = result?.receipt?.transactionHash || result?.txHash || result?.error?.originalError?.receipt?.transactionHash;
    const transactionHash = isRoleTransactionHash(rawHash) ? rawHash : row[field].transactionHash;
    const noSend = result?.submissionState === 'not-submitted' || result === false && row[field].transportStarted === false;
    const status = row[field].status === 'executed' ? 'executed' : result?.success && transactionHash ? 'pending'
      : noSend ? 'failed' : 'uncertain';
    saveRoleContinuation(storage(), ticket.scope, { ...row, [field]: { ...row[field], status,
      ...(noSend ? { failureKind: 'submission', transportOutcome: 'not-submitted' } : {}),
      ...(result?.success && transactionHash ? { transportOutcome: 'succeeded' } : {}),
      ...(proposalId ? { proposalId } : {}), ...(transactionHash ? { transactionHash } : {}) } });
    reloadContinuations();
  }, [reloadContinuations]);
  const trackRoleSubmission = useCallback((ticket, prepared) => {
    const revalidate = prepared?.revalidate;
    if (typeof revalidate !== 'function') throw new Error('Review the current role settings before creating this vote.');
    if (!ticket) return { revalidate, assertCurrent: assertContinuationCurrent, notSubmitted() {}, stop() {} };
    const field = ticket.stage === 'create' ? 'creation' : 'configuration';
    let expectedIntentKey, lastSubmission, stopped = false, completed = false;
    const submissionHistory = [];
    const update = change => {
      const row = readRoleContinuations(storage(), ticket.scope).find(row => row.id === ticket.id);
      if (!row || row[field]?.attemptId !== ticket.attemptId) throw new Error('The saved role submission changed.');
      saveRoleContinuation(storage(), ticket.scope, { ...row, [field]: { ...row[field], ...change } });
    };
    const capture = (input, ownCallback = false) => {
      if (!expectedIntentKey) return;
      const pending = input || services.txManager?.getPendingSubmission?.();
      if (!pending) return;
      let submission;
      try { submission = roleRecoveryIdentity(pending, ticket.scope, expectedIntentKey); } catch { return; }
      if (lastSubmission) {
        if (!sameRoleRecoveryAttempt(lastSubmission, submission)) {
          // Only this exact manager invocation's public callback can identify an
          // intentional self-funded replacement after a definite admission refusal.
          if (!ownCallback) return;
          submissionHistory.push(lastSubmission);
        } else if (submission.recovery.revision < lastSubmission.recovery.revision) return;
      }
      update({ submission, ...(submissionHistory.length ? { submissionHistory } : {}) }); lastSubmission = submission;
    };
    const listener = () => { try { capture(); } catch { /* The manager still owns its journal; completion retries persistence. */ } };
    window.addEventListener('poa:submission', listener);
    const tracker = {
      revalidate, assertCurrent: assertContinuationCurrent,
      bindIntent(contract, method, args, options) {
        assertContinuationCurrent();
        if (expectedIntentKey || contract.address.toLowerCase() !== ticket.scope.hybridVoting) throw new Error('This role vote does not match the saved submission.');
        const intentKey = roleSubmissionIntent(contract, method, args, options);
        // Manager entry is allowed only after the exact binding is durable. A
        // failed storage write must remain a provable pre-transport refusal.
        update({ expectedIntentKey: intentKey, transportStarted: true });
        expectedIntentKey = intentKey;
      },
      notSubmitted() {
        if (!expectedIntentKey) { completed = true; finishRoleSubmission(ticket, { success: false, submissionState: 'not-submitted' }); }
      },
      captureSubmitted(input) {
        const pending = services.txManager?.getPendingSubmission?.();
        if (!pending || pending.computedHash?.toLowerCase() !== input.computedHash?.toLowerCase()
          || pending.nonce !== String(input.nonce) || pending.kind !== input.kind) return;
        capture(pending, true);
      },
      complete(result) {
        capture();
        // Public errors/lastSubmission may retain the journal after another surface cleared it.
        for (const input of [result?.error?.submission, result?.error?.originalError?.nativeSubmission, services.txManager?.lastSubmission]) {
          if (input?.recovery) capture(input);
        }
        completed = true;
        // Positive pre-broadcast lifecycle plus a returned failure: absence alone is insufficient.
        const preSend = result?.success === false && lastSubmission && (result.submissionState === 'not-submitted' || canAbandonSubmissionRecovery(lastSubmission.recovery))
          && !services.txManager?.getPendingSubmission?.();
        finishRoleSubmission(ticket, preSend ? { ...result, submissionState: 'not-submitted' } : result);
      },
      get completed() { return completed; },
      stop() { if (!stopped) { window.removeEventListener('poa:submission', listener); stopped = true; } },
    };
    return tracker;
  }, [assertContinuationCurrent, services.txManager, finishRoleSubmission]);
  const assertReviewCurrent = useCallback(() => {
    if (currentIdentity.current !== reviewScope || !reviewScope.active || !enabled || !authority.enabled
      || !isAuthHydrated || !isAuthenticated || !accountAddress) {
      throw new Error('The organization or account changed. Review the role again.');
    }
  }, [reviewScope, enabled, authority.enabled, isAuthHydrated, isAuthenticated, accountAddress]);
  const observeRole = useCallback(async (form, { signal } = {}) => {
    assertReviewCurrent();
    assertRoleObservationActive(signal);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    reviewScope.controllers.add(controller);
    const current = () => { assertRoleObservationActive(controller.signal); assertReviewCurrent(); };
    try {
      const infrastructure = await refetchInfrastructure();
      current();
      if (infrastructure.error) throw new Error('Current organization settings could not be verified.');
      const registry = infrastructure.data?.poaManagerContracts?.[0]?.orgRegistryProxy || infrastructure.data?.orgRegistryContracts?.[0]?.id || '';
      const paymaster = infrastructure.data?.poaManagerContracts?.[0]?.paymasterHubProxy || '';
      const contracts = Object.fromEntries(Object.entries({ membershipAuthority: authorityAddress,
        executor, hybridVoting, taskManager: taskManagerAddress, participationToken: participationTokenAddress, paymentManager: paymentManagerAddress, registry, paymaster, email: zkEmailAddress,
      }).filter(([, address]) => address && !/^0x0{40}$/i.test(address)));
      const continuation = form.continuationId ? await resolveContinuation(form.continuationId, { signal: controller.signal }) : null;
      current();
      if (continuation && (continuation.proof.state !== 'created' || continuation.configuration && !['failed', 'rejected'].includes(continuation.configuration.status))) {
        throw new Error('Your earlier vote is still waiting or needs attention. Check Finish configuration before submitting another.');
      }
      // Sequential continuation proofs can outlive the snapshot's review freshness window.
      const authoritySnapshot = await refetchAuthority();
      current();
      const request = roleFormRequest(form, { subjectId: continuation?.proof.subjectId,
        continuation: continuation?.creation });
      return { input: { snapshot: authoritySnapshot, endpoint: subgraphUrl,
        scope: { chainId: orgChainId, orgId, contract: authorityAddress, contracts, account: accountAddress.toLowerCase() },
        request, query: apolloProtocolQuery, rpcEndpoint: getNetworkByChainId(orgChainId)?.rpcUrl },
      display: { nativeSymbol, tokenLabel } };
    } finally {
      signal?.removeEventListener('abort', cancel);
      reviewScope.controllers.delete(controller);
    }
  }, [refetchInfrastructure, refetchAuthority, authorityAddress, executor,
    hybridVoting, taskManagerAddress, zkEmailAddress, orgChainId, orgId, reviewScope, nativeSymbol, assertReviewCurrent, accountAddress, resolveContinuation, participationTokenAddress, paymentManagerAddress, subgraphUrl, tokenLabel]);
  const roleReview = useMemo(() => createRoleReviewSession({ describe: observeRole, service: services.roleCreation,
    fetchDocument: fetchFromIpfs, uploadDocument: addToIpfs, assertCurrent: assertReviewCurrent,
    registerController: controller => { reviewScope.controllers.add(controller); return () => reviewScope.controllers.delete(controller); },
  }), [observeRole, fetchFromIpfs, addToIpfs, services.roleCreation, assertReviewCurrent, reviewScope]);


  useEffect(() => () => roleReview.invalidate(), [roleReview]);

  const reviewRoleConfiguration = useCallback(async (form, options) => {
    try { return await roleReview.review(form, options); } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'PLANNING_READ_LIMIT' || error?.code === 'ROLE_OPERATION_UNAVAILABLE') throw error;
      throw new Error('Current role settings could not be verified. Refresh and review them again.', { cause: error });
    }
  }, [roleReview]);
  const prepareReviewedRole = useCallback(async form => {
    try { return await roleReview.prepare(form); } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'PLANNING_READ_LIMIT' || error?.code === 'ROLE_OPERATION_UNAVAILABLE') throw error;
      throw new Error('The role settings changed or could not be verified. Review the role again before creating this vote.', { cause: error });
    }
  }, [roleReview]);

  const read = useCallback(async (freshInfrastructure, signal) => {
    assertReviewCurrent();
    const registry = freshInfrastructure?.poaManagerContracts?.[0]?.orgRegistryProxy || freshInfrastructure?.orgRegistryContracts?.[0]?.id || orgRegistry;
    const hub = freshInfrastructure?.poaManagerContracts?.[0]?.paymasterHubProxy || paymasterHub;
    const contracts = Object.fromEntries(Object.entries({ membershipAuthority: authorityAddress, executor, hybridVoting,
      taskManager: taskManagerAddress, participationToken: participationTokenAddress, paymentManager: paymentManagerAddress, registry, paymaster: hub, email: zkEmailAddress }).filter(([, address]) => address && !/^0x0{40}$/i.test(address)));
    const authoritySnapshot = await refetchAuthority();
    assertRoleObservationActive(signal); assertReviewCurrent();
    const operation = await services.roleCreation.getRolePlanningEvidence({ snapshot: authoritySnapshot, endpoint: subgraphUrl,
      scope: { chainId: orgChainId, orgId, contract: authorityAddress, contracts, account: accountAddress.toLowerCase() },
      purpose: 'capabilities', request: roleFormRequest({ sponsorship: { enabled: false } }), query: apolloProtocolQuery,
      rpcEndpoint: getNetworkByChainId(orgChainId)?.rpcUrl, signal });
    assertRoleObservationActive(signal); assertReviewCurrent();
    const options = requireRoleOperation(operation).context.data;
    const sponsor = options.sponsorship, email = options.email;
    const knownBoolean = fact => fact?.state === 'known' && typeof fact.value === 'boolean';
    const sponsorshipReady = !contracts.paymaster || knownBoolean(sponsor?.operatorAuthorized);
    const emailReady = !contracts.email || ['enabled', 'authorityMatches', 'domainEnabled', 'emailEnabled'].every(key => knownBoolean(email?.[key]));
    return {
      identity: [orgChainId, orgId, subgraphUrl, authorityAddress, executor, hybridVoting, taskManagerAddress, participationTokenAddress, paymentManagerAddress, registry, hub, zkEmailAddress].join(':'),
      orgRegistry: registry, paymasterHub: hub,
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
  }, [assertReviewCurrent, refetchAuthority, services.roleCreation, authorityAddress, executor, hybridVoting, taskManagerAddress,
    orgRegistry, paymasterHub, zkEmailAddress, orgChainId, orgId, accountAddress, subgraphUrl, participationTokenAddress, paymentManagerAddress]);

  const optionsController = useRef(null);
  const refresh = useCallback(async (_form, { signal } = {}) => {
    assertReviewCurrent(); assertRoleObservationActive(signal);
    optionsController.current?.abort();
    const controller = new AbortController();
    optionsController.current = controller;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    reviewScope.controllers.add(controller);
    try {
    assertRoleObservationActive(controller.signal); assertReviewCurrent();
    setSnapshot(null);
    const infrastructure = await refetchInfrastructure();
    if (infrastructure.error) throw new Error('Could not reload this org’s configuration. Please retry.');
    assertRoleObservationActive(controller.signal); assertReviewCurrent();
    const value = await read(infrastructure.data, controller.signal);
    if (!value) throw new Error('Role configuration is still loading. Please try again.');
    if (currentIdentity.current !== reviewScope || !reviewScope.active) throw new Error('The organization changed. Review the role again.');
    setSnapshot({ ...value, scopeKey: reviewScope.key });
    return value;
    } catch (error) {
      if (!controller.signal.aborted && currentIdentity.current === reviewScope && reviewScope.active) {
        setSnapshot({ identity, scopeKey: reviewScope.key, error: 'Current organization settings could not be verified. Recheck sponsorship.' });
      }
      throw error;
    } finally { signal?.removeEventListener('abort', cancel); reviewScope.controllers.delete(controller); }
  }, [read, refetchInfrastructure, reviewScope, assertReviewCurrent, identity]);

  return useMemo(() => {
    const current = snapshot?.identity === identity && snapshot.scopeKey === reviewScope.key ? snapshot : null;
    const unavailable = current?.error ? { ready: false, error: current.error } : pending;
    return {
      orgId, orgRegistry, paymasterHub, executor, zkEmailAddress,
      continuations: saved.scope === continuationScope ? saved.rows : [], resolveContinuation, beginRoleSubmission, finishRoleSubmission, trackRoleSubmission,
      nativeSymbol,
      sponsorshipConfig: { ...(current?.sponsorshipConfig || unavailable), nativeSymbol },
      emailConfig: current?.emailConfig || unavailable,
      metadataAdminSubject: current?.metadataAdminSubject,
      configurationError: current?.error || (infraError ? 'Could not load this org’s configuration.' : null),
      refreshRoleCreation: refresh,
      reviewRoleConfiguration,
      prepareReviewedRole,
    };
  }, [snapshot, identity, reviewScope, orgId, orgRegistry, paymasterHub, executor, zkEmailAddress, nativeSymbol, infraError, refresh, reviewRoleConfiguration, prepareReviewedRole, saved, continuationScope, resolveContinuation, beginRoleSubmission, finishRoleSubmission, trackRoleSubmission]);
}
