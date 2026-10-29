import React, { useEffect, useRef, useState } from 'react';
import { Alert, AlertIcon, Box, Button, HStack, Text, VStack } from '@chakra-ui/react';

/** Discoverable local drafts on the voting page, including after refresh/reopen.
 * Check status never signs. Finish opens the actual form for a separate review/submit. */
export default function RoleContinuationPanel({ ctx, onResume }) {
  const [state, setState] = useState({});
  const current = useRef(ctx.resolveContinuation);
  const checking = useRef(new Set());
  current.current = ctx.resolveContinuation;
  useEffect(() => { current.current = ctx.resolveContinuation; checking.current = new Set(); setState({}); return () => { current.current = null; }; }, [ctx.resolveContinuation]);
  const check = async row => {
    const checks = checking.current;
    if (checks.has(row.id)) return;
    checks.add(row.id);
    const resolver = ctx.resolveContinuation;
    setState(value => ({ ...value, [row.id]: { loading: true } }));
    try {
      const result = await resolver(row.id);
      if (current.current !== resolver) return;
      if (result.proof.state === 'created' && result.requiresConfiguration !== false && (!result.configuration || ['failed', 'rejected'].includes(result.configuration.status))) {
        onResume({ ...result.form, continuationId: row.id });
        setState(value => ({ ...value, [row.id]: {} }));
      } else {
        const message = result.configuration?.status === 'executed' ? 'The configuration vote passed and ran successfully.'
          : result.proof.state === 'created' && result.requiresConfiguration === false ? 'The role or group was created. This request is complete in one vote.'
          : result.proof.state === 'pending' ? 'Waiting for the creation vote to pass and run. Your settings are saved.'
          : result.proof.state === 'failed' ? result.creation.failureKind === 'submission'
            ? 'The creation vote was not submitted successfully. Review a new creation vote to try again.'
            : 'The creation vote did not run successfully. No configuration was submitted.'
            : result.proof.state === 'rejected' ? 'The creation vote was not approved. Your draft is retained.'
              : 'Your configuration vote is already submitted. Check it in the votes below.';
        setState(value => ({ ...value, [row.id]: { message } }));
      }
    } catch (error) {
      const message = /^[A-Z][A-Z_0-9]+$/.test(error?.message || '')
        ? 'The saved vote could not be verified. Refresh its status and try again.' : error?.message || 'Status is unavailable. Try again.';
      if (current.current === resolver) setState(value => ({ ...value, [row.id]: { message } }));
    } finally { checks.delete(row.id); }
  };
  if (!ctx.continuations?.length) return null;
  return <VStack align="stretch" mb={5} spacing={3} data-testid="role-continuations">
    {ctx.continuations.map(row => <Box key={row.id} p={4} bg="white" borderRadius="lg" borderWidth="1px">
      <HStack justify="space-between" align="start">
        <Box><Text fontWeight="bold">{row.requiresConfiguration === false ? 'Role creation' : 'Finish configuration'}: {row.form.name}</Text>
          <Text fontSize="sm">{row.configuration
            ? row.configuration.status === 'failed' ? row.configuration.failureKind === 'submission'
              ? 'The configuration vote was not submitted successfully. Review the saved settings to try again.'
              : `Configuration vote ${row.configuration.proposalId ? `#${row.configuration.proposalId} ` : ''}did not run successfully. Review the saved settings to try again.`
              : row.configuration.status === 'rejected' ? 'The configuration vote was not approved. Review the saved settings to try again.'
                : row.configuration.status === 'executed' ? 'The configuration vote passed and ran successfully.'
                  : `Configuration vote ${row.configuration.proposalId ? `#${row.configuration.proposalId}` : 'submission'} ${row.configuration.status === 'uncertain' || row.configuration.status === 'submitting' ? 'needs a status check' : 'submitted'}.`
            : row.creation.proposalId ? `Creation vote #${row.creation.proposalId}. ${row.requiresConfiguration === false ? 'Check the outcome below.' : 'Your requested settings are saved for a separate vote.'}`
              : row.creation.status === 'failed' ? 'The creation vote was not submitted successfully. Your draft is saved.'
                : 'Creation submission needs a status check. Your draft is saved; no duplicate vote will be sent.'}</Text>
        </Box>
        <Button size="sm" isLoading={state[row.id]?.loading} onClick={() => check(row)} data-testid={`role-continuation-${row.id}`}>
          {row.configuration || row.requiresConfiguration === false ? 'Check status' : 'Finish configuration'}
        </Button>
      </HStack>
      {['failed', 'rejected'].includes(row.creation.status) && <Button size="sm" mt={2} variant="outline"
        onClick={() => { const form = { ...row.form }; delete form.continuationId; onResume(form); }} data-testid={`role-continuation-restart-${row.id}`}>Review a new creation vote</Button>}
      {state[row.id]?.message && <Alert status="info" mt={3}><AlertIcon />{state[row.id].message}</Alert>}
    </Box>)}
  </VStack>;
}
