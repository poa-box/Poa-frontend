import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, FormControl, FormLabel, HStack, Input, Text, VStack } from '@chakra-ui/react';
import { inputStyles } from '@/components/shared/glassStyles';

const retryable = stage => ['failed', 'rejected'].includes(stage?.status);
const uncertain = stage => stage && (stage.recoveryInvalid || ['submitting', 'uncertain'].includes(stage.status));
const needsAction = row => !row.creation || uncertain(row.creation) || uncertain(row.configuration)
  || retryable(row.creation) || retryable(row.configuration)
  || row.creation.status === 'created' && row.requiresConfiguration !== false && !row.configuration;
const pending = row => row.creation?.status === 'pending' || row.configuration?.status === 'pending';
const completedVote = (row, stage, votes) => stage?.status === 'pending' && stage.proposalId != null && row.scope?.hybridVoting
  ? votes.find(vote => vote.id?.toLowerCase() === `${row.scope.hybridVoting}-${stage.proposalId}`.toLowerCase()) : null;
const retryHint = vote => vote && (vote.executionFailed === true || vote.isValid === false || Number(vote.winningOption) > 0);
const needsRecheck = (row, votes) => {
  const creation = completedVote(row, row.creation, votes);
  return Boolean(creation && (retryHint(creation) || row.requiresConfiguration !== false && !row.configuration)
    || retryHint(completedVote(row, row.configuration, votes)));
};

/** Saved drafts and recovery actions live inside Votes. The cards own vote status.
 * Saved pending states are only hints: refresh on entry and changes to vote outcomes,
 * without polling, signing, reopening forms automatically, or discarding records. */
export default function RoleContinuationPanel({ ctx, onResume, completedVotes = [] }) {
  const refreshKey = JSON.stringify(completedVotes.map(vote => [vote.id, vote.status, vote.executionFailed, vote.isValid, vote.winningOption]));
  const scope = useMemo(() => ({ resolver: ctx.resolveContinuation, checking: new Set(), checked: new Map() }), [ctx.resolveContinuation]);
  const current = useRef(scope); current.current = scope;
  const [snapshot, setSnapshot] = useState(null);
  const state = useMemo(() => snapshot?.scope === scope ? snapshot.rows : {}, [snapshot, scope]);
  useEffect(() => { current.current = scope; return () => { current.current = null; }; }, [scope]);
  const update = useCallback((id, patch) => {
    if (current.current !== scope) return;
    setSnapshot(value => {
      const rows = value?.scope === scope ? value.rows : {};
      return { scope, rows: { ...rows, [id]: { ...rows[id], ...patch } } };
    });
  }, [scope]);
  const check = useCallback(async (row, automatic = false) => {
    if (scope.checking.has(row.id)) return;
    scope.checking.add(row.id);
    update(row.id, { loading: true, message: null });
    try {
      const result = await scope.resolver(row.id, { candidateTxHash: state[row.id]?.creation || undefined,
        configurationTxHash: state[row.id]?.configuration || undefined });
      if (current.current !== scope) return;
      if (!automatic && result.proof.state === 'preparing') {
        const form = { ...result.form }; delete form.continuationId; onResume(form);
      } else if (!automatic && result.proof.state === 'created' && result.requiresConfiguration !== false
        && (!result.configuration || retryable(result.configuration))) {
        onResume({ ...result.form, continuationId: row.id });
      }
    } catch (error) {
      const message = /^[A-Z][A-Z_0-9]+$/.test(error?.message || '')
        ? 'The saved vote could not be verified. Check again to continue.' : error?.message || 'Status is unavailable. Try again.';
      update(row.id, { message });
    } finally { scope.checking.delete(row.id); update(row.id, { loading: false }); }
  }, [scope, state, onResume, update]);

  useEffect(() => {
    if (scope.checking.size) return;
    for (const row of ctx.continuations || []) {
      if (!pending(row) || uncertain(row.creation) || uncertain(row.configuration) || scope.checking.has(row.id)) continue;
      // Recovery persists revisions as it reads. Those writes must not trigger a read loop.
      const key = JSON.stringify([refreshKey, row.creation?.attemptId, row.configuration?.attemptId]);
      if (scope.checked.get(row.id) === key) continue;
      scope.checked.set(row.id, key);
      void check(row, true);
      break;
    }
  }, [ctx.continuations, refreshKey, scope, check]);

  // A completed feed can arrive ahead of the authority snapshot used by recovery.
  // Keep an explicit recheck reachable; only exact recovery above may open the form.
  const rows = (ctx.continuations || []).filter(row => needsAction(row) || needsRecheck(row, completedVotes) || state[row.id]?.message);
  if (!rows.length) return null;
  return <VStack align="stretch" mb={5} spacing={2} color="white" data-testid="role-continuations">
    {rows.map(row => <Box key={row.id} py={3} px={3} bg="whiteAlpha.50" borderRadius="lg" borderWidth="1px" borderColor="whiteAlpha.200" minW={0}>
      <HStack justify="space-between" align="center" spacing={3} flexWrap="wrap">
        <Box flex="1" minW="min(100%, 180px)">
          <Text fontSize="sm" fontWeight="600" overflowWrap="anywhere">{row.form.name}</Text>
          {(!row.creation || retryable(row.creation) || retryable(row.configuration)) && <Text fontSize="xs" color="gray.300">
            {!row.creation ? 'Saved draft'
              : retryable(row.configuration) ? row.configuration.status === 'rejected' ? 'The settings vote was not approved.'
                : row.configuration.failureKind === 'submission' ? 'The settings vote was not submitted successfully.' : 'The settings vote did not run successfully.'
                : row.creation.status === 'rejected' ? 'The creation vote was not approved.'
                  : row.creation.failureKind === 'submission' ? 'The creation vote was not submitted successfully.' : 'The creation vote did not run successfully.'}
          </Text>}
        </Box>
        <Button size="sm" variant="ghost" color="purple.200" _hover={{ bg: 'whiteAlpha.200' }} flexShrink={0}
          isLoading={state[row.id]?.loading} onClick={() => check(row)} data-testid={`role-continuation-${row.id}`}>
          {!row.creation ? 'Review saved draft' : uncertain(row.creation) || uncertain(row.configuration) || state[row.id]?.message || retryable(row.creation) || needsRecheck(row, completedVotes)
            ? 'Check saved vote' : 'Continue role setup'}
        </Button>
      </HStack>
      {['creation', 'configuration'].filter(field => row[field]?.submission?.kind === 'transaction'
        && !row[field].transactionHash && ['submitting', 'uncertain'].includes(row[field].status)).map(field => <FormControl key={field} mt={3}>
        <FormLabel fontSize="sm">{field === 'creation' ? 'Creation' : 'Configuration'} vote transaction reference (optional)</FormLabel>
        <Input {...inputStyles} size="sm" data-testid={`role-reference-${row.id}-${field}`} value={state[row.id]?.[field] || ''} isDisabled={state[row.id]?.loading}
          onChange={event => update(row.id, { [field]: event.target.value.trim() })} />
        <Text fontSize="xs" color="gray.300" mt={1}>Use the reference from your account activity. Checking never submits another vote.</Text>
      </FormControl>)}
      {retryable(row.creation) && <Button size="sm" mt={2} variant="ghost" color="purple.200" _hover={{ bg: 'whiteAlpha.200' }}
        onClick={() => { const form = { ...row.form }; delete form.continuationId; onResume(form); }} data-testid={`role-continuation-restart-${row.id}`}>Review a new creation vote</Button>}
      {state[row.id]?.message && <Text role="status" fontSize="sm" color="gray.300" mt={2} overflowWrap="anywhere">{state[row.id].message}</Text>}
    </Box>)}
  </VStack>;
}
