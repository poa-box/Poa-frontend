import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Code,
  Heading,
  HStack,
  Link as ChakraLink,
  Spinner,
  Text,
  useDisclosure,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useAuth } from '@/context/AuthContext';
import { useClaimZkEmailRole, ZK_CLAIM_STEPS } from '@/hooks/useClaimZkEmailRole';
import { useZkEmailInviteSummary } from '@/hooks/useZkEmailInviteSummary';
import { buildCommand, buildMailto } from '@/lib/zkemail/prover';
import PasskeyOnboardingModal from '@/components/passkey/PasskeyOnboardingModal';
import SignInModal from '@/components/passkey/SignInModal';

// Optional inbox to receive the verification email (e.g. a Cloudflare Email Worker). Empty = the
// user mails it to themselves; either way the proof is over the DKIM-signed message they sent.
const CLAIM_INBOX = process.env.NEXT_PUBLIC_ZKEMAIL_INBOX || '';

/**
 * The client-side ZK Email claim flow: send a DKIM-signed email containing the bound command, upload
 * it, prove it in-browser, and submit the (gasless) claim. Render only when `zkEmailInvitesEnabled`.
 */
/** Verified who-can-join summary (domains + roles from the root-matched allowlist file). */
function InviteSummary({ summary }) {
  const { status, domains, emailCount, refresh } = summary;

  if (status === 'loading') {
    return (
      <HStack fontSize="sm" color="gray.500">
        <Spinner size="xs" />
        <Text>Checking this organization’s invite list…</Text>
      </HStack>
    );
  }
  if (status === 'unknown') {
    // Chain read failed: liveness is NOT known (could be dormant) — don't claim invites are active.
    return (
      <Alert status="warning" borderRadius="lg" fontSize="sm">
        <AlertIcon />
        <HStack justify="space-between" w="full">
          <Text>Couldn’t check this organization’s invite list right now (network hiccup).</Text>
          <Button size="xs" onClick={refresh} flexShrink={0}>
            Re-check
          </Button>
        </HStack>
      </Alert>
    );
  }
  if (status === 'degraded') {
    return (
      <Alert status="warning" borderRadius="lg" fontSize="sm">
        <AlertIcon />
        <HStack justify="space-between" w="full">
          <Text>
            Email invites are active, but the invite list couldn’t be loaded right now. You can still try
            to claim — your eligibility is checked against the on-chain list when you upload your email.
          </Text>
          <Button size="xs" onClick={refresh} flexShrink={0}>
            Re-check
          </Button>
        </HStack>
      </Alert>
    );
  }
  if (status !== 'active') return null;

  return (
    <Box p={4} borderWidth="1px" borderRadius="lg" bg="blackAlpha.50">
      <Text fontWeight="semibold" fontSize="sm" mb={2}>
        Who can claim here:
      </Text>
      <Wrap spacing={2}>
        {domains.map(({ domain, roleNames }) => (
          <WrapItem key={domain}>
            <Badge px={2} py={1} borderRadius="md" colorScheme="teal" textTransform="none">
              @{domain}
              {roleNames.length > 0 ? ` → ${roleNames.join(', ')}` : ''}
            </Badge>
          </WrapItem>
        ))}
        {emailCount > 0 && (
          <WrapItem>
            <Badge px={2} py={1} borderRadius="md" colorScheme="purple" textTransform="none">
              {emailCount} invited address{emailCount > 1 ? 'es' : ''}
            </Badge>
          </WrapItem>
        )}
      </Wrap>
    </Box>
  );
}

export default function ZkEmailClaimFlow() {
  const { accountAddress, isAuthenticated } = useAuth();
  const { claimByDomain, step, error, reset } = useClaimZkEmailRole();
  const summary = useZkEmailInviteSummary();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  // First-time visitors may have NO account at all — the claim gate offers inline passkey
  // onboarding (declared before the early returns per rules of hooks).
  const createDisclosure = useDisclosure();
  const signInDisclosure = useDisclosure();

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

  // Module deployed but no allowlist activated: every claim would revert AllowlistNotActive —
  // say so instead of walking the user through steps that cannot succeed.
  if (summary.status === 'dormant') {
    return (
      <VStack spacing={4} align="stretch">
        <Box>
          <Heading size="md">Claim a role with your email</Heading>
        </Box>
        <Alert status="info" borderRadius="lg">
          <AlertIcon />
          <HStack justify="space-between" w="full">
            <Text>
              This organization has email invites set up but hasn’t activated an invite list yet. Check
              back once governance activates it.
            </Text>
            <Button size="xs" onClick={summary.refresh} flexShrink={0}>
              Re-check
            </Button>
          </HStack>
        </Alert>
      </VStack>
    );
  }

  if (!isAuthenticated || !accountAddress) {
    return (
      <VStack spacing={4} align="stretch">
        <Box>
          <Heading size="md">Claim a role with your email</Heading>
          <Text mt={1} color="gray.600">
            Prove you control an invited email — entirely in your browser. No password, no relayer.
          </Text>
        </Box>
        <InviteSummary summary={summary} />

        {/* No dead ends for brand-new users: the role is granted to an account, so offer to CREATE
            one right here (passkey — gasless, no wallet needed), sign in, or connect a wallet. On
            success AuthContext updates and this gate re-renders straight into the claim steps. */}
        <Box p={4} borderWidth="1px" borderRadius="lg">
          <Text fontWeight="semibold">First, set up the account that will receive your role</Text>
          <Text fontSize="sm" color="gray.600" mt={1} mb={3}>
            New here? Create an account with a passkey — no wallet, no seed phrase, and claiming is
            gas-free. Already have one? Sign in or connect your wallet.
          </Text>
          <HStack spacing={3} flexWrap="wrap">
            <Button colorScheme="teal" size="sm" onClick={createDisclosure.onOpen}>
              Create account with a passkey
            </Button>
            <Button variant="outline" size="sm" onClick={signInDisclosure.onOpen}>
              Sign in
            </Button>
          </HStack>
        </Box>

        <PasskeyOnboardingModal
          isOpen={createDisclosure.isOpen}
          onClose={createDisclosure.onClose}
          onSuccess={() => {}}
          showWalletOption
          paymasterHatId={summary.firstClaimableHatKey || undefined}
        />
        <SignInModal
          isOpen={signInDisclosure.isOpen}
          onClose={signInDisclosure.onClose}
          onSuccess={() => {}}
          onCreateAccount={() => {
            signInDisclosure.onClose();
            createDisclosure.onOpen();
          }}
        />
      </VStack>
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

      <InviteSummary summary={summary} />

      {/* Actionable steps only when the allowlist is verifiably live ('active') or provably live but
          temporarily unreadable ('degraded' — the claim path re-verifies). Never during 'loading' or
          'unknown', where a dormant module would otherwise flash a claim UI that cannot succeed. */}
      {(summary.status === 'active' || summary.status === 'degraded') && (
        <>
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
              Export it as a <Code>.eml</Code> (in Gmail: ⋮ → Show original → Download Original) and choose it
              here.
            </Text>
            <input ref={fileRef} type="file" accept=".eml,message/rfc822" hidden onChange={onFile} />
            <Button onClick={() => fileRef.current?.click()} isDisabled={busy} size="sm">
              {fileName || 'Choose .eml file'}
            </Button>
          </Box>
        </>
      )}

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
