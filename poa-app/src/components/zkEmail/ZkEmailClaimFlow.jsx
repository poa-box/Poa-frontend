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
  Input,
  Link as ChakraLink,
  Spinner,
  Text,
  useDisclosure,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuth } from '@/context/AuthContext';
import { useClaimZkEmailRole, ZK_CLAIM_STEPS } from '@/hooks/useClaimZkEmailRole';
import { useZkEmailInviteSummary } from '@/hooks/useZkEmailInviteSummary';
import { buildCommand, buildMailto } from '@/lib/zkemail/prover';
import SignInModal from '@/components/passkey/SignInModal';

// Optional claim inbox (a Cloudflare Email Worker — see cloudflare-worker-claim-inbox/). When BOTH
// the address and the worker URL are set, the user just sends the email and clicks "fetch" — the
// page pulls the signed message itself, no manual .eml export. Manual upload always stays as the
// permissionless fallback. Unset = manual-upload-only.
const CLAIM_INBOX = process.env.NEXT_PUBLIC_ZKEMAIL_INBOX || '';
const CLAIM_INBOX_URL = (process.env.NEXT_PUBLIC_ZKEMAIL_INBOX_URL || '').replace(/\/$/, '');
const INBOX_ENABLED = Boolean(CLAIM_INBOX && CLAIM_INBOX_URL);

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
      </Wrap>
      {emailCount > 0 && (
        <Text fontSize="xs" color="gray.600" mt={2}>
          Some people are also invited by their personal email address — those invites aren’t listed
          here. If you were told you’re invited, your email works even if your domain isn’t shown.
        </Text>
      )}
    </Box>
  );
}

/**
 * The client-side ZK Email claim flow. Two entry paths, both ending in the same steps UI:
 *  - EXISTING account (EOA/passkey signed in): steps bind to the connected address.
 *  - BRAND-NEW user: pick a username → a passkey is created locally (no transaction) and the steps
 *    bind to the new account's counterfactual address; the final upload submits ONE gasless UserOp
 *    that creates the account, registers the username, and mints the role — nothing to do first.
 * Render only when `zkEmailInvitesEnabled`.
 */
export default function ZkEmailClaimFlow() {
  const { isAuthenticated, accountAddress } = useAuth();
  const {
    claim,
    finishClaim,
    ready,
    step,
    error,
    reset,
    pendingAccount,
    prepareNewPasskey,
    discardPendingPasskey,
    newAccountReady,
    claimerAddress,
  } = useClaimZkEmailRole();
  const summary = useZkEmailInviteSummary();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [username, setUsername] = useState('');
  const [creating, setCreating] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const signInDisclosure = useDisclosure();

  const busy =
    step === ZK_CLAIM_STEPS.CHECKING ||
    step === ZK_CLAIM_STEPS.PROVING ||
    step === ZK_CLAIM_STEPS.SIGNING ||
    step === ZK_CLAIM_STEPS.SUBMITTING;

  const onFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      // Clear the value immediately: browsers suppress onChange for an unchanged value, which would
      // otherwise kill the natural retry path (re-picking the same .eml after an error).
      e.target.value = '';
      if (!file) return;
      setFileName(file.name);
      const emlText = await file.text();
      await claim(emlText);
    },
    [claim],
  );

  const onCreatePasskey = useCallback(async () => {
    setCreating(true);
    try {
      await prepareNewPasskey(username);
    } finally {
      setCreating(false);
    }
  }, [prepareNewPasskey, username]);

  // Auto-fetch: poll the claim inbox worker for the received (signed) email, then prove it — no
  // manual export. Bounded poll; manual upload remains available the whole time.
  const fetchFromInbox = useCallback(async () => {
    if (!claimerAddress || !INBOX_ENABLED) return;
    setFetching(true);
    setFetchMsg('Waiting for your email to arrive… (send it if you haven’t)');
    const deadline = Date.now() + 150_000; // ~2.5 min
    try {
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${CLAIM_INBOX_URL}/claim-email?claimer=${claimerAddress}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'ready' && data.eml) {
              setFetchMsg('');
              setFetching(false);
              setFileName('(fetched from inbox)');
              await claim(data.eml);
              return;
            }
          }
        } catch (_) {
          /* transient — keep polling */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      setFetchMsg('Didn’t see your email yet. Send it to the address above, then try again — or upload the .eml below.');
    } finally {
      setFetching(false);
    }
  }, [claimerAddress, claim]);

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
        {!isAuthenticated && pendingAccount && (
          <Alert status="info" borderRadius="lg" fontSize="sm">
            <AlertIcon />
            <HStack justify="space-between" w="full" align="start">
              <Text>
                You have a pending claim account (<b>{pendingAccount.username}</b>,{' '}
                <Code fontSize="xs">{pendingAccount.accountAddress}</Code>) — it stays usable once the
                invite list is activated.
              </Text>
              <Button size="xs" variant="outline" onClick={discardPendingPasskey} flexShrink={0}>
                Start over
              </Button>
            </HStack>
          </Alert>
        )}
      </VStack>
    );
  }

  if (step === ZK_CLAIM_STEPS.DONE) {
    return (
      <VStack spacing={4} align="stretch">
        <Alert status="success" borderRadius="lg">
          <AlertIcon />
          Role claimed! You’re signed in and your new role will appear shortly.
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

  const hasClaimTarget = Boolean(claimerAddress); // signed-in address OR freshly-created passkey account
  const stepsLive = summary.status === 'active' || summary.status === 'degraded';

  return (
    <VStack spacing={5} align="stretch">
      <Box>
        <Heading size="md">Claim a role with your email</Heading>
        <Text mt={1} color="gray.600">
          Prove you control an allowlisted email — entirely in your browser. No password, no relayer.
        </Text>
      </Box>

      <InviteSummary summary={summary} />

      {/* Brand-new user, allowlist live: ONE-STEP setup — a username is all that's needed. The
          passkey is created locally (no transaction); account + username + role all land together
          in the single claim transaction at the end. */}
      {stepsLive && !isAuthenticated && !pendingAccount && (
        <Box p={4} borderWidth="1px" borderRadius="lg">
          <Text fontWeight="semibold">New here? Pick a username to get started</Text>
          <Text fontSize="sm" color="gray.600" mt={1} mb={3}>
            Your passkey is created with your fingerprint — no wallet, no seed phrase, no gas. Your
            account and role are created together when you upload your email in the final step.
          </Text>
          <HStack spacing={3} align="stretch" flexWrap="wrap">
            <Input
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              size="sm"
              maxW="240px"
            />
            <Button
              colorScheme="teal"
              size="sm"
              onClick={onCreatePasskey}
              isLoading={creating}
              isDisabled={!newAccountReady || username.trim().length < 3}
            >
              Create passkey & continue
            </Button>
          </HStack>
          <HStack spacing={3} mt={3}>
            <Text fontSize="xs" color="gray.500">
              Already have an account?
            </Text>
            <Button variant="link" size="xs" onClick={signInDisclosure.onOpen}>
              Sign in with passkey
            </Button>
            <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
          </HStack>
        </Box>
      )}

      {/* Pending passkey banner: the steps below bind to this new account's address. */}
      {!isAuthenticated && pendingAccount && (
        <Alert status="info" borderRadius="lg" fontSize="sm">
          <AlertIcon />
          <HStack justify="space-between" w="full" align="start">
            <Text>
              Claiming as <b>{pendingAccount.username}</b> — your new account{' '}
              <Code fontSize="xs">{pendingAccount.accountAddress}</Code> is created the moment your claim
              lands (no separate setup).
            </Text>
            <Button size="xs" variant="outline" onClick={discardPendingPasskey} flexShrink={0}>
              Start over
            </Button>
          </HStack>
        </Alert>
      )}

      {/* Actionable steps: allowlist verifiably live AND we know which address the email must bind to. */}
      {stepsLive && hasClaimTarget && (
        <>
          <Box p={4} borderWidth="1px" borderRadius="lg">
            <Text fontWeight="semibold">1. Send the verification email</Text>
            {INBOX_ENABLED ? (
              <Text fontSize="sm" color="gray.600" mb={2}>
                From the <b>invited email address</b>, send a message with this exact subject to{' '}
                <Code fontSize="xs">{CLAIM_INBOX}</Code>. The body doesn’t matter — we’ll fetch and
                verify it for you in the next step.
              </Text>
            ) : (
              <Text fontSize="sm" color="gray.600" mb={2}>
                From the <b>invited email address</b>, send a message with this exact subject to{' '}
                <b>another inbox you can open</b> — a work email, a second account, etc. The body doesn’t
                matter. (Don’t send it to the same address: your own Sent copy is saved <i>before</i> the
                provider signs it, so it can never verify.)
              </Text>
            )}
            <Code p={2} borderRadius="md" w="full" whiteSpace="pre-wrap" display="block">
              {buildCommand(claimerAddress)}
            </Code>
            <Alert status="warning" borderRadius="md" fontSize="xs" mt={2} py={2}>
              <AlertIcon boxSize={3} />
              Compose it in your provider’s <b>own website or official app</b> (e.g. mail.google.com).
              Messages sent through third-party apps like Spark are stored <b>without</b> the signature
              this claim needs.
            </Alert>
            <HStack mt={3} spacing={3} flexWrap="wrap">
              <Button
                as={ChakraLink}
                href={`https://mail.google.com/mail/?view=cm&fs=1${CLAIM_INBOX ? `&to=${encodeURIComponent(CLAIM_INBOX)}` : ''}&su=${encodeURIComponent(buildCommand(claimerAddress))}`}
                isExternal
                colorScheme="blue"
                size="sm"
              >
                Compose in Gmail (web)
              </Button>
              <Button
                as={ChakraLink}
                href={buildMailto({ to: CLAIM_INBOX, claimer: claimerAddress })}
                isExternal
                variant="outline"
                size="sm"
              >
                Other provider…
              </Button>
            </HStack>
          </Box>

          {/* Auto-fetch via the claim inbox worker — no manual export. Feature-flagged. */}
          {INBOX_ENABLED && (
            <Box p={4} borderWidth="1px" borderRadius="lg" borderColor="blue.200" bg="blue.50">
              <Text fontWeight="semibold" color="blue.800">
                2. Fetch &amp; verify your email
              </Text>
              <Text fontSize="sm" color="blue.800" mt={1} mb={3}>
                Once you’ve sent it, click below — we’ll pick up the signed message from{' '}
                <Code fontSize="xs">{CLAIM_INBOX}</Code> and prove it automatically. No download needed.
              </Text>
              <Button colorScheme="blue" size="sm" onClick={fetchFromInbox} isLoading={fetching} isDisabled={busy}>
                I sent it — fetch &amp; verify
              </Button>
              {fetchMsg && (
                <Text fontSize="xs" color="blue.800" mt={2}>
                  {fetchMsg}
                </Text>
              )}
            </Box>
          )}

          <Box p={4} borderWidth="1px" borderRadius="lg">
            <Text fontWeight="semibold">
              {INBOX_ENABLED
                ? 'Or upload the raw email yourself'
                : '2. Download the raw email from the inbox that RECEIVED it'}
            </Text>
            <Text fontSize="sm" color="gray.600" mt={1}>
              Open the <b>received copy</b> (not your Sent folder — that copy is unsigned) and export the{' '}
              <b>original message with its full headers</b>. Mobile apps and most third-party mail apps
              (Spark, etc.) <b>cannot</b> export this — use the provider’s <b>website</b>:
            </Text>
            <Box fontSize="sm" color="gray.600" pl={4} my={2}>
              <Text>
                • <b>Gmail</b> — open <b>mail.google.com</b> in a browser → open the message (your sent
                copy works) → ⋮ More → <b>Show original</b> → <b>Download original</b>
              </Text>
              <Text mt={1}>
                • <b>Outlook</b> — outlook.com → open the message → ⋯ → <b>Save as</b> (.eml)
              </Text>
              <Text mt={1}>
                • <b>Apple Mail</b> (Mac) — select the message → File → Save As… → format{' '}
                <b>Raw Message Source</b>
              </Text>
              <Text mt={1}>
                • <b>Spark / other apps</b> — no raw export; open the account’s website instead (e.g.
                mail.google.com for a Gmail address) and export from there
              </Text>
            </Box>
            <Text fontSize="sm" color="gray.600" mb={2}>
              Forwarded copies, screenshots, or PDFs won’t verify.{' '}
              {!isAuthenticated && 'Your account, username, and role are all created in this one step.'}
            </Text>
            {/* No `accept` filter: some platform pickers grey out valid .eml files with it; the
                upload is content-validated (DKIM header pre-flight) instead. */}
            <input ref={fileRef} type="file" hidden onChange={onFile} />
            <Button onClick={() => fileRef.current?.click()} isDisabled={busy} size="sm">
              {fileName || 'Choose .eml file'}
            </Button>
          </Box>

          {/* Step 3: the proof is done — a SEPARATE click fires the passkey/wallet signature. This is
              required, not just tidy: WebAuthn refuses to run after the long prove consumed the
              file-pick's user activation ("The document is not focused"). Gated on `ready && !busy` so
              a cancelled biometric (step → ERROR) still leaves the button to retry — the cached proof
              means the retry is instant. */}
          {ready && !busy && (
            <Box p={4} borderWidth="1px" borderRadius="lg" borderColor="teal.300" bg="teal.50">
              <Text fontWeight="semibold" color="teal.800">
                {step === ZK_CLAIM_STEPS.ERROR ? '3. Almost there — try again' : '3. Email verified ✓ — finish your claim'}
              </Text>
              <Text fontSize="sm" color="teal.800" mt={1} mb={3}>
                Your email proof is ready. {!isAuthenticated
                  ? 'Tap below and confirm with your passkey — your account, username, and role are created together in one gasless transaction.'
                  : 'Tap below and confirm to mint your role.'}
              </Text>
              <Button colorScheme="teal" size="sm" onClick={finishClaim}>
                {step === ZK_CLAIM_STEPS.ERROR ? 'Retry — confirm with your passkey' : 'Finish & claim my role'}
              </Button>
            </Box>
          )}
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
                : step === ZK_CLAIM_STEPS.SIGNING
                  ? 'Confirm with your passkey — your account, username, and role go on-chain together…'
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

      <SignInModal
        isOpen={signInDisclosure.isOpen}
        onClose={signInDisclosure.onClose}
        onSuccess={() => {}}
        onCreateAccount={() => signInDisclosure.onClose()}
      />
    </VStack>
  );
}
