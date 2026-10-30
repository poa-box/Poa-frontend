import { useQuery, gql } from '@apollo/client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSubgraphClient } from '@/util/apolloClient';
import { usePOContext } from '@/context/POContext';
import { FETCH_TREASURY_DATA } from '@/util/queries';
import { FETCH_GAS_POOL_DATA } from '@/util/passkeyQueries';

const HEAD = gql`query TreasuryHistoryHead { _meta { block { number hash } hasIndexingErrors } }`;

/** Canonical complete financial streams; metadata for the existing ledger remains in Apollo. */
export async function readTreasuryFinancialFacts({ client, orgId, chainId, endpoint, taskManager, paymentManager }) {
  const [{ readTreasuryWorkFacts, readDistributionHistoryFacts, readPaymentHistoryFacts }, { coreDocument, coreFields }, taskDocs, treasuryDocs] = await Promise.all([
    import('@poa-box/core/reads/treasury'), import('@/lib/graphql/coreDocuments'),
    import('@poa-box/core/graph/documents/task'), import('@poa-box/core/graph/documents/treasury'),
  ]);
  const result = await client.query({ query: HEAD, fetchPolicy: 'network-only' });
  const meta = result.data?._meta;
  if (result.errors?.length || meta?.hasIndexingErrors || !Number.isSafeInteger(meta?.block?.number)) throw new Error('Treasury history unavailable');
  const block = { number: String(meta.block.number), ...(meta.block.hash ? { hash: meta.block.hash } : {}) };
  const source = { chainId, orgId, endpoint, method: 'graphql', indexed: true, snapshot: 'pinned', block };
  const query = async (document, variables) => {
    // Display fields reuse canonical selections on the flat, paginated streams.
    // No active-project filter is added to completion history.
    let parsed = gql(document);
    if (document.includes('FetchTreasuryTaskActivityPage')) parsed = coreDocument(document, { fields: { tasks: {
      add: coreFields(taskDocs.FETCH_PROJECTS_DATA, 'organization.taskManager.projects.tasks',
        { only: ['title', 'assignee', 'assigneeUsername', 'completer', 'completerUsername', 'completedAt'] }),
    } } });
    if (document.includes('FetchDistributionsPage')) parsed = coreDocument(document, { fields: { distributions: {
      add: coreFields(treasuryDocs.FETCH_TREASURY_DATA, 'organization.paymentManager.distributions',
        { only: ['createdAt', 'finalizedAt', 'unclaimedAmount', 'claims'] }),
    } } });
    if (document.includes('FetchPaymentsPage')) parsed = coreDocument(document, { fields: { payments: {
      add: coreFields(treasuryDocs.FETCH_TREASURY_DATA, 'organization.paymentManager.payments', { only: ['payerUsername'] }),
    } } });
    const response = await client.query({ query: parsed, variables, fetchPolicy: 'network-only' });
    if (response.errors?.length) throw new Error('Treasury history unavailable');
    return response.data;
  };
  const options = { source, query, pageSize: 500, maxPages: 10 };
  const entries = await Promise.all([
    taskManager ? readTreasuryWorkFacts({ ...options, source: { ...source, contract: taskManager }, kind: 'promised' }) : null,
    taskManager ? readTreasuryWorkFacts({ ...options, source: { ...source, contract: taskManager }, kind: 'completed' }) : null,
    paymentManager ? readDistributionHistoryFacts({ ...options, source: { ...source, contract: paymentManager } }) : null,
    paymentManager ? readPaymentHistoryFacts({ ...options, source: { ...source, contract: paymentManager } }) : null,
  ]);
  return { promised: entries[0], completed: entries[1], distributions: entries[2], payments: entries[3] };
}

// Original documents preserve route-warm cache identity and the host's extra display fields.
export function useTreasuryReadQueries({ orgId, subgraphUrl, enabled = true }) {
  const { orgChainId, taskManagerContractAddress, paymentManagerAddress } = usePOContext();
  const client = useSubgraphClient(subgraphUrl);
  const options = { variables: { orgId }, skip: !enabled || !orgId || !subgraphUrl, fetchPolicy: 'cache-first', client };
  const treasury = useQuery(FETCH_TREASURY_DATA, options);
  const gasPool = useQuery(FETCH_GAS_POOL_DATA, options);
  const [facts, setFacts] = useState({ scope: null, data: null, error: null, loading: false });
  const generation = useRef(0);
  const scopeKey = [orgId, subgraphUrl, orgChainId, taskManagerContractAddress, paymentManagerAddress, enabled].join(':');
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const refreshFacts = useCallback(async () => {
    const request = ++generation.current;
    if (!enabled || !orgId || !subgraphUrl || !orgChainId) return;
    const current = () => generation.current === request && scopeRef.current === scopeKey;
    setFacts({ scope: scopeKey, data: null, error: null, loading: true });
    try {
      const data = await readTreasuryFinancialFacts({ client, orgId, chainId: orgChainId, endpoint: subgraphUrl,
        taskManager: taskManagerContractAddress, paymentManager: paymentManagerAddress });
      if (current()) setFacts({ scope: scopeKey, data, error: null, loading: false });
    } catch (error) { if (current()) setFacts({ scope: scopeKey, data: null, error, loading: false }); }
  }, [client, orgId, subgraphUrl, orgChainId, taskManagerContractAddress, paymentManagerAddress, enabled, scopeKey]);
  useEffect(() => { const sequence = generation; refreshFacts(); return () => { sequence.current++; }; }, [refreshFacts]);
  const currentFacts = facts.scope === scopeKey ? facts : { data: null, error: null, loading: true };
  return { treasury: { ...treasury, financialFacts: currentFacts.data, factsError: currentFacts.error, factsLoading: currentFacts.loading,
    refetch: async (...args) => { const [result] = await Promise.all([treasury.refetch(...args), refreshFacts()]); return result; } }, gasPool };
}
