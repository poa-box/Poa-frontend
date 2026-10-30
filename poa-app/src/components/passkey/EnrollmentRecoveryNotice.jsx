import { useState } from 'react';
import { Alert, AlertIcon, Box, Button, Input, Text } from '@chakra-ui/react';

/** Status and recovery-only migration never activate an unverified old credential. */
export default function EnrollmentRecoveryNotice({ enrollment }) {
  const [originalHash, setOriginalHash] = useState('');
  const { hasPendingEnrollment, checkPendingEnrollment, isChecking, recoveryError, recoveryStatus,
    canRestart, restartExistingAccount } = enrollment;
  if (!hasPendingEnrollment && !recoveryError) return null;
  const message = recoveryError?.userMessage || recoveryError?.message
    || (recoveryStatus === 'reauthenticate' ? 'Your saved setup was verified and kept for recovery. Sign in with your existing passkey before continuing.'
      : recoveryStatus === 'restart-ready' ? 'Your earlier setup is kept. Send a new verification email for your signed-in account to claim your role.'
        : recoveryStatus === 'unknown' ? 'Your earlier account setup is still unconfirmed. Check again later.'
          : recoveryStatus === 'failed' ? 'Your earlier account setup did not complete. You can continue with the saved passkey.'
            : recoveryStatus === 'not-submitted' ? 'Your saved account setup has not been submitted. Continue in the flow where you started.'
              : 'You have an earlier account setup. Check its status before creating another account.');
  return <Alert status="info" borderRadius="lg" my={3}>
    <AlertIcon />
    <Box><Text fontSize="sm" role="status">{message}</Text>
      {canRestart && <Input size="sm" mt={2} aria-label="Original account setup transaction reference (optional)"
        placeholder="Original transaction reference (optional)" value={originalHash} onChange={event => setOriginalHash(event.target.value.trim())} />}
      <Button size="sm" mt={2} onClick={() => checkPendingEnrollment(originalHash)} isLoading={isChecking}>Check account setup</Button>
      {canRestart && <Button size="sm" mt={2} ml={2} onClick={restartExistingAccount} isDisabled={isChecking}>Use signed-in account</Button>}
    </Box>
  </Alert>;
}
