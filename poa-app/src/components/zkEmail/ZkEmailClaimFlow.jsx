import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Code,
  Heading,
  HStack,
  Link as ChakraLink,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';
import { useClaimZkEmailRole, ZK_CLAIM_STEPS } from '@/hooks/useClaimZkEmailRole';
import { buildCommand, buildMailto } from '@/lib/zkemail/prover';

// Optional inbox to receive the verification email (e.g. a Cloudflare Email Worker). Empty = the
// user mails it to themselves; either way the proof is over the DKIM-signed message they sent.
const CLAIM_INBOX = process.env.NEXT_PUBLIC_ZKEMAIL_INBOX || '';

/**
 * The client-side ZK Email claim flow: send a DKIM-signed email containing the bound command, upload
 * it, prove it in-browser, and submit the (gasless) claim. Render only when `zkEmailInvitesEnabled`.
 */
export default function ZkEmailClaimFlow() {
  const { accountAddress, isAuthenticated } = useAuth();
  const { claimByDomain, step, error, reset } = useClaimZkEmailRole();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');

  const busy =
    step === ZK_CLAIM_STEPS.CHECKING || step === ZK_CLAIM_STEPS.PROVING || step === ZK_CLAIM_STEPS.SUBMITTING;

  const onFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      const emlText = await file.text();
      await claimByDomain(emlText);
    },
    [claimByDomain],
  );

  if (!isAuthenticated || !accountAddress) {
    return (
      <Alert status="info" borderRadius="lg">
        <AlertIcon />
        Connect your wallet or passkey to claim a role by email.
      </Alert>
    );
  }

  if (step === ZK_CLAIM_STEPS.DONE) {
    return (
      <VStack spacing={4} align="stretch">
        <Alert status="success" borderRadius="lg">
          <AlertIcon />
          Role claimed! Your new hats will appear shortly.
        </Alert>
        <Button
          alignSelf="start"
          onClick={() => {
            reset();
            setFileName('');
          }}
        >
          Claim another
        </Button>
      </VStack>
    );
  }

  return (
    <VStack spacing={5} align="stretch">
      <Box>
        <Heading size="md">Claim a role with your email</Heading>
        <Text mt={1} color="gray.600">
          Prove you control an allowlisted email — entirely in your browser. No password, no relayer.
        </Text>
      </Box>

      <Box p={4} borderWidth="1px" borderRadius="lg">
        <Text fontWeight="semibold">1. Send the verification email</Text>
        <Text fontSize="sm" color="gray.600" mb={2}>
          From the email you want to verify, send a message with this exact subject:
        </Text>
        <Code p={2} borderRadius="md" w="full" whiteSpace="pre-wrap" display="block">
          {buildCommand(accountAddress)}
        </Code>
        <HStack mt={3}>
          <Button
            as={ChakraLink}
            href={buildMailto({ to: CLAIM_INBOX, claimer: accountAddress })}
            isExternal
            colorScheme="blue"
            size="sm"
          >
            Open pre-filled email
          </Button>
        </HStack>
      </Box>

      <Box p={4} borderWidth="1px" borderRadius="lg">
        <Text fontWeight="semibold">2. Upload the sent email</Text>
        <Text fontSize="sm" color="gray.600" mb={2}>
          Export it as a <Code>.eml</Code> (in Gmail: ⋮ → Show original → Download Original) and choose it here.
        </Text>
        <input ref={fileRef} type="file" accept=".eml,message/rfc822" hidden onChange={onFile} />
        <Button onClick={() => fileRef.current?.click()} isDisabled={busy} size="sm">
          {fileName || 'Choose .eml file'}
        </Button>
      </Box>

      {busy && (
        <HStack>
          <Spinner size="sm" />
          <Text>
            {step === ZK_CLAIM_STEPS.CHECKING
              ? 'Checking the organization’s allowlist…'
              : step === ZK_CLAIM_STEPS.PROVING
                ? 'Proving your email in your browser — this can take up to a minute (plus a one-time download the first time)…'
                : 'Submitting your claim…'}
          </Text>
        </HStack>
      )}

      {step === ZK_CLAIM_STEPS.ERROR && error && (
        <Alert status="error" borderRadius="lg" fontSize="sm">
          <AlertIcon />
          {error.message || 'Something went wrong.'}
        </Alert>
      )}
    </VStack>
  );
}
