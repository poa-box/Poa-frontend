import { useAccount, useSwitchChain } from '@/context/WalletContext';
/**
 * useClaimZkEmailRole
 * Orchestrates a client-side ZK Email role claim against the merkle-allowlist model:
 *   1. read the org's active allowlist (root + CID) on-chain,
 *   2. fetch the allowlist file from IPFS and assert it matches the on-chain root,
 *   3. decide the claimer's entry — a SPECIFIC-address entry for their From email if present, else a
 *      whole-DOMAIN entry for their sending domain,
 *   4. prove the matching circuit in-browser (v2 for email, v1 for domain),
 *   5. submit the claim with the entry's hatIds + merkle proof (gasless via PaymasterHub on a passkey).
 *
 * TWO submission paths:
 *   - EXISTING account (EOA or passkey signed in): plain claimRoleBy{Domain,Email} via the tx manager.
 *   - BRAND-NEW user (no account at all): ONE-STEP onboarding — `prepareNewPasskey(username)` creates
 *     a local credential (no transaction) and computes the counterfactual account address the email
 *     subject binds to; the claim then submits registerAndClaimBy{Domain,Email}WithPasskey as a single
 *     gasless UserOp that deploys the account + registers the username + mints the role, atomically —
 *     the exact analog of the join page's vouch-first "Create Account & Get Vouch Link" flow.
 *     The pending credential persists in localStorage so a refresh between "send the email" and
 *     "upload the .eml" cannot strand the address the user already emailed.
 *
 * ZkEmailInvites is OPTIONAL — this hook refuses to run unless `zkEmailInvitesEnabled` (POContext).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@apollo/client';
import { getClient } from '@/util/apolloClient';
import { useWeb3Services, useTransactionWithNotification } from '@/hooks/useWeb3Services';
import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/authState';
import { useIPFScontext } from '@/context/ipfsContext';
import { useOrgName } from '@/hooks/useOrgName';
import { DEFAULT_CHAIN_ID } from '@/config/networks';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { createZkEmailOnboardingService } from '@/services/web3/domain/ZkEmailOnboardingService';
import {
  requirePendingEnrollment,
  removePendingCredential,
} from '@/services/web3/passkey/passkeyStorage';
import { UniversalAccountRegistryAbi as UniversalAccountRegistryABI } from '@poa-box/core/abis/UniversalAccountRegistry';
import { useEnrollmentScope, enrollmentInitiator } from '@/hooks/useEnrollmentScope';
import { useEnrollmentRecovery } from '@/hooks/useEnrollmentRecovery';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS } from '@/util/passkeyQueries';
import { generateDomainProof, generateEmailAddressProof, parseEml } from '@/lib/zkemail/prover';
import { claimSubmissionUnconfirmed } from '@/lib/zkemail/claimErrors';
import { emailHash, assertRootMatches, proofForDomain, proofForEmailHash } from '@/lib/zkemail/allowlist';

export const ZK_CLAIM_STEPS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  PROVING: 'proving',
  PROOF_READY: 'proof_ready', // proved; waiting for a user click to sign (WebAuthn needs fresh activation)
  SIGNING: 'signing', // biometric prompts for the one-step passkey path
  SUBMITTING: 'submitting',
  DONE: 'done',
  ERROR: 'error',
};

const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function useClaimZkEmailRole() {
  const { zkEmailInvites, txManager } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { zkEmailInvitesAddress, zkEmailInvitesEnabled, orgId, orgChainId, subgraphUrl } = usePOContext();
  const auth = useAuth();
  const {
    accountAddress,
    isAuthenticated,
    isPasskeyUser,
    publicClient: homePublicClient,
    bundlerClient: homeBundlerClient,
    activatePasskey,
  } = auth;
  const { chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { safeFetchFromIpfs, bytes32ToIpfsCid } = useIPFScontext();
  const orgName = useOrgName();

  const [step, setStep] = useState(ZK_CLAIM_STEPS.IDLE);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  // Live prove-phase feedback: {phase:'download',done,total} | {phase:'assemble'|'cache-hit'|'prove'}.
  const [proveProgress, setProveProgress] = useState(null);


  /* ── Infra for the one-step path (org-chain clients + addresses, same sourcing as onboarding) ── */
  const isCrossChain = orgChainId && orgChainId !== DEFAULT_CHAIN_ID;
  const { publicClient, bundlerClient, chainId } = useMemo(() => {
    if (!isCrossChain) {
      return { publicClient: homePublicClient, bundlerClient: homeBundlerClient, chainId: DEFAULT_CHAIN_ID };
    }
    const clients = createChainClients(orgChainId);
    if (!clients) return { publicClient: null, bundlerClient: null, chainId: orgChainId };
    return { publicClient: clients.publicClient, bundlerClient: clients.bundlerClient, chainId: orgChainId };
  }, [isCrossChain, orgChainId, homePublicClient, homeBundlerClient]);

  const orgClient = useMemo(() => getClient(subgraphUrl), [subgraphUrl]);
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, { client: orgClient, skip: !subgraphUrl });
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, { client: orgClient, skip: !subgraphUrl });
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;
  const factoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  const newAccountReady = Boolean(
    auth.isAuthHydrated !== false && subgraphUrl && orgChainId && publicClient && bundlerClient && factoryAddress && registryAddress && paymasterAddress && orgId && zkEmailInvitesAddress && orgName,
  );

  // Cache the last successful proof so a failure AFTER proving (biometric cancel, bundler timeout,
  // paymaster rejection) retries in seconds instead of re-running the 17-60s prove. Nothing on-chain
  // is consumed by a failed submission (the nullifier is only marked on success).
  const proofCacheRef = useRef(null);

  // A proved-but-not-yet-submitted claim, held between `claim()` (prove) and `finishClaim()` (sign +
  // submit). The split exists because the passkey/wallet signature MUST be triggered by a fresh user
  // gesture — a 14-40s prove expires the file-pick activation, so auto-firing WebAuthn throws
  // "The document is not focused". `ready` drives the "Finish" button in the UI.
  const readyRef = useRef(null);
  const completedActivation = useRef(null);
  const [ready, setReady] = useState(false);
  // Synchronous in-flight lock so a double-click on "Finish" can't fire a second passkey ceremony /
  // submission before the async setStep(SIGNING) re-renders the button away.
  const submittingRef = useRef(false);
  const preparingRef = useRef(false);

  const source = useMemo(() => ({ chainId, registryAddress, factoryAddress, orgId, targetAddress: zkEmailInvitesAddress, flow: 'zkemail', subgraphUrl }), [chainId, registryAddress, factoryAddress, orgId, zkEmailInvitesAddress, subgraphUrl]);
  const { guard, scope } = useEnrollmentScope(auth, [orgId, orgChainId, subgraphUrl, zkEmailInvitesAddress, paymasterAddress, source]);
  const wait = useCallback(async promise => { guard(); const value = await promise; guard(); return value; }, [guard]);
  const onConfirmed = useCallback(value => { guard(); completedActivation.current = { accountAddress: value.accountAddress, source: JSON.stringify(source) }; setMeta(previous => ({ ...previous, claimer: value.accountAddress, username: value.username || previous?.username })); setStep(ZK_CLAIM_STEPS.DONE); }, [guard, source]);
  const onRestart = useCallback(() => {
    guard(); readyRef.current = null; proofCacheRef.current = null; setReady(false);
    setStep(ZK_CLAIM_STEPS.IDLE); setError(null); setMeta(null);
  }, [guard]);
  const recovery = useEnrollmentRecovery({ auth, source, guard, onConfirmed, onRestart });
  const pendingAccount = recovery.pendingEnrollment?.provenance === 'matched'
    && recovery.pendingEnrollment.credential.sourceProvenance === 'observed' && recovery.pendingEnrollment.credential.initiator
    && recovery.pendingEnrollment.credential.flow === 'zkemail' && recovery.pendingEnrollment.credential.accountAddress ? recovery.pendingEnrollment.credential : null;

  const onboardingService = useMemo(() => {
    if (!newAccountReady) return null;
    return createZkEmailOnboardingService({
      publicClient,
      bundlerClient,
      factoryAddress,
      registryAddress,
      zkEmailInvitesAddress,
      paymasterAddress,
      orgId,
      chainId, scopeGuard: guard, initiator: enrollmentInitiator(auth), orgName,
    });
  }, [newAccountReady, publicClient, bundlerClient, factoryAddress, registryAddress, zkEmailInvitesAddress, paymasterAddress, orgId, chainId, guard, auth, orgName]);

  const [visibleScope, setVisibleScope] = useState(scope);
  const preservesActivation = completedActivation.current
    && completedActivation.current.accountAddress?.toLowerCase() === accountAddress?.toLowerCase()
    && isPasskeyUser && completedActivation.current.source === JSON.stringify(source);

  useEffect(() => {
    setVisibleScope(scope);
    const completed = completedActivation.current;
    completedActivation.current = null;
    if (completed && completed.accountAddress?.toLowerCase() === accountAddress?.toLowerCase()
      && isPasskeyUser && completed.source === JSON.stringify(source)) return;
    setStep(ZK_CLAIM_STEPS.IDLE); setError(null); setMeta(null); setProveProgress(null);
    readyRef.current = null; proofCacheRef.current = null; submittingRef.current = false; preparingRef.current = false; setReady(false);
  }, [scope, accountAddress, isPasskeyUser, source]);

  const reset = useCallback(() => {
    guard();
    setStep(ZK_CLAIM_STEPS.IDLE);
    setError(null);
    setMeta(null);
    setProveProgress(null);
    readyRef.current = null;
    proofCacheRef.current = null;
    setReady(false);
  }, [guard]);

  const fail = useCallback((e) => {
    try { guard(); } catch { return { success: false }; }
    let err = e instanceof Error ? e : new Error(String(e));
    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
      err = new Error('Passkey prompt was cancelled — try again when you are ready.');
    } else if (/dkim.*(not found|fail|invalid|mismatch)|no (dkim|signature)/i.test(err.message || '')) {
      err = new Error(
        'The email’s signature couldn’t be verified from this file. Download the ORIGINAL raw message ' +
          'from your provider’s website (Gmail: mail.google.com → open the message → ⋮ → Show original → ' +
          'Download original) — mobile apps, Spark, forwards, and PDFs won’t work. ' +
          `(${err.message})`,
      );
    }
    setError(err);
    setStep(ZK_CLAIM_STEPS.ERROR);
    return { success: false, error: err };
  }, [guard]);

  /**
   * ONE-STEP path, part 1 (no transaction): create the passkey credential locally and compute the
   * counterfactual account address the verification email must bind to. Persisted per-org.
   */
  const prepareNewPasskey = useCallback(
    async (username) => {
      guard();
      setError(null);
      const name = (username || '').trim();
      if (name.length < 3) return fail(new Error('Pick a username (at least 3 characters) first.'));
      if (!onboardingService || !orgName) {
        return fail(new Error('Account infrastructure is still loading — try again in a moment.'));
      }
      try {
        requirePendingEnrollment(source, { flow: 'zkemail', username: name });
        // Fail BEFORE the biometric prompt if the username is taken — a collision surfacing inside
        // the final claim transaction would invalidate the already-emailed subject address.
        const owner = await wait(publicClient.readContract({
          address: registryAddress,
          abi: UniversalAccountRegistryABI,
          functionName: 'getAddressOfUsername',
          args: [name],
        }));
        if (owner && owner !== '0x0000000000000000000000000000000000000000') {
          return fail(new Error(`The username "${name}" is already taken — pick another.`));
        }
        const { accountAddress: addr } = await wait(onboardingService.createPendingCredential(name));
        recovery.refreshPending();
        return { success: true, accountAddress: addr };
      } catch (e) {
        return fail(e);
      }
    },
    [guard, source, recovery, wait, onboardingService, orgName, publicClient, registryAddress, fail],
  );

  /** Abandon the pending credential (e.g. the user wants a different username). */
  const discardPendingPasskey = useCallback(() => {
    guard();
    try {
      if (pendingAccount?.accountAddress) {
        if (!onboardingService || onboardingService.getPendingSubmission(pendingAccount.accountAddress)
          || pendingAccount.confirmation?.status === 'succeeded') throw new Error('Check the earlier account setup before changing it.');
        removePendingCredential(pendingAccount.accountAddress, source);
      }
      recovery.refreshPending(); reset();
    } catch (error) { return fail(error); }
  }, [guard, source, pendingAccount, onboardingService, recovery, reset, fail]);

  // The address the email subject must bind to: the signed-in account, or the pending one.
  const claimerAddress = isAuthenticated && accountAddress ? accountAddress : pendingAccount?.accountAddress || null;

  /**
   * Claim a role by proving control of an email the org's allowlist invites.
   * Existing accounts submit a plain claim; a pending passkey submits the one-step
   * register-and-claim UserOp (account deploy + username + role, atomically).
   * @param {string} emlText raw .eml the user controls (sent from the address being verified)
   */
  const claim = useCallback(
    async (emlText) => {
      guard();
      if (preparingRef.current || submittingRef.current) return { success: false };
      // A new upload must never leave the old claim's Finish action available.
      readyRef.current = null; setReady(false);
      setError(null);
      if (!zkEmailInvitesEnabled || !zkEmailInvitesAddress) {
        return fail(new Error('This organization does not have ZK Email invites enabled.'));
      }
      const oneStep = !(isAuthenticated && accountAddress);
      if (!oneStep && recovery.hasPendingEnrollment && !recovery.restartReady) {
        return fail(new Error('Choose “Use signed-in account” before starting a fresh email claim. Your earlier setup will be kept.'));
      }
      if (oneStep && !pendingAccount) {
        return fail(new Error('Create your passkey first (or sign in) so the claim has an account to land in.'));
      }
      if (!oneStep && !zkEmailInvites) {
        return fail(new Error('Web3 services are not ready yet — try again in a moment.'));
      }
      if (oneStep && !onboardingService) {
        return fail(new Error('Account infrastructure is still loading — try again in a moment.'));
      }
      const claimer = oneStep ? pendingAccount.accountAddress : accountAddress;

      preparingRef.current = true;
      try {
        // 1-2. Read the active allowlist and fetch + verify the file.
        setStep(ZK_CLAIM_STEPS.CHECKING);
        let root;
        let cid;
        ({ root, cid } = await wait(oneStep
          ? onboardingService.getActiveAllowlist()
          : zkEmailInvites.getActiveAllowlist(zkEmailInvitesAddress)));
        if (!root || root === ZERO_ROOT) {
          return fail(new Error('This organization has not activated an email allowlist yet.'));
        }
        const cidStr = bytes32ToIpfsCid(cid);
        const doc = await wait(safeFetchFromIpfs(cidStr));
        if (!doc) return fail(new Error('Could not load the allowlist file from IPFS — try again.'));
        const tree = assertRootMatches(doc, root); // throws if the file does not match the on-chain root

        // Pre-flight: the upload must be a RAW RFC-822 message carrying its DKIM signature. App
        // "downloads" (Gmail/Spark mobile), forwards, and PDF/screenshot exports lack it, and the
        // prover's own error for that case is cryptic.
        if (!/^DKIM-Signature:/im.test(emlText)) {
          // Third-party composer (Spark/Readdle etc. over SMTP): the provider stores the SUBMITTED
          // copy, which is unsigned — the DKIM signature is only added on outbound delivery. No
          // export of this copy can ever verify; the message must be COMPOSED in the provider's own
          // website/app and re-sent.
          const thirdParty = /@Spark>|X-Readdle|X-Mailer:(?!.*(Gmail|Outlook))/im.test(emlText);
          // No Received chain at all = the SENT-folder copy, stored at composition BEFORE the
          // provider's outbound server adds the DKIM signature. Only the DELIVERED copy is signed.
          const sentCopy = !/^Received:/im.test(emlText);
          return fail(
            new Error(
              thirdParty
                ? 'This email was composed in a third-party app (e.g. Spark), so the saved copy has no ' +
                  'cryptographic signature — no export of it will work. Re-send the message from your ' +
                  'provider’s own website (e.g. mail.google.com) with the same subject, then download ' +
                  'the copy from the inbox that RECEIVED it.'
                : sentCopy
                  ? 'This is your SENT copy — it was saved before the signature was added, so it can ' +
                    'never verify. Download the message from the inbox that RECEIVED it instead. If you ' +
                    'sent it to your own address in the same account, re-send it (same subject) to a ' +
                    'DIFFERENT inbox you can open — a work email or second account — and export it there ' +
                    'via ⋮ → Show original → Download original.'
                  : 'This file doesn’t contain the email’s cryptographic signature. Download the ORIGINAL raw ' +
                    'message from the RECEIVING inbox via the provider’s WEBSITE — Gmail: mail.google.com → ' +
                    'open the message → ⋮ → Show original → Download original. Mobile apps and most mail ' +
                    'apps (Spark, etc.) cannot produce this file.',
            ),
          );
        }

        // Fast-fail on a stale subject BEFORE the expensive prove: the email must bind THIS claimer.
        const boundMatch = emlText.match(/Claim POP role for (0x[0-9a-fA-F]{40})/);
        if (boundMatch && boundMatch[1].toLowerCase() !== claimer.toLowerCase()) {
          return fail(
            new Error(
              `This email is bound to ${boundMatch[1]}, but you are claiming as ${claimer}. ` +
                (oneStep
                  ? 'Re-send the verification email with the exact subject shown above.'
                  : 'It was probably sent for a previous pending account — sign out to resume it, or re-send the email with the subject shown above.'),
            ),
          );
        }

        // 3. Pick the claimer's entry: a specific-address entry for their From email wins, else domain.
        const { fromEmail, fromDomain } = parseEml(emlText);
        let mode = null;
        let entry = null;
        if (fromEmail) {
          const eHash = await wait(emailHash(fromEmail));
          entry = proofForEmailHash(tree, eHash);
          if (entry) mode = 'email';
          // Fail fast BEFORE the ~30s prove: specific-address entries are one-registration-per-address
          // on-chain (a fresh email does not grant a second registration). Fail-open on read errors —
          // the contract enforces regardless.
          if (entry) {
            try {
              const already = await wait(oneStep
                ? onboardingService.isEmailRegistered(eHash)
                : zkEmailInvites.isEmailRegistered(zkEmailInvitesAddress, eHash));
              if (already) {
                return fail(
                  new Error(
                    `${fromEmail} has already been used to register here. If this is your address and you need to re-register (e.g. you lost access to your old account), ask an org admin to re-open it.`,
                  ),
                );
              }
            } catch (_) {
              /* pre-flight only — the contract still rejects duplicates */
            }
          }
        }
        guard();
        if (!entry && fromDomain) {
          entry = await wait(proofForDomain(tree, fromDomain));
          if (entry) mode = 'domain';
        }
        if (!entry) {
          return fail(
            new Error(
              `Neither your address (${fromEmail || '?'}) nor your domain (@${fromDomain || '?'}) is on this organization's allowlist.`,
            ),
          );
        }

        // 4. Prove the matching circuit (v2 for a specific address, v1 for a domain) — or reuse the
        //    cached proof if this exact (email, claimer, mode) already proved and only submission failed.
        let proof;
        let proofMeta;
        const cache = proofCacheRef.current;
        if (cache && cache.emlText === emlText && cache.claimer === claimer && cache.mode === mode) {
          ({ proof, proofMeta } = cache);
        } else {
          setStep(ZK_CLAIM_STEPS.PROVING);
          ({ proof, meta: proofMeta } =
            await wait((mode === 'email' ? generateEmailAddressProof : generateDomainProof)({
              emlText, claimer, onProgress: value => { guard(); setProveProgress(value); },
            })));
          proofCacheRef.current = { emlText, claimer, mode, proof, proofMeta };
        }
        setMeta({ mode, hatIds: entry.hatIds, ...proofMeta, claimer, username: oneStep ? pendingAccount.username : undefined });

        // Proof is ready. STOP before signing: the on-chain step needs a passkey/wallet signature,
        // which the browser only permits from a FRESH user gesture. The 14-40s prove has expired the
        // file-pick activation, so auto-firing the ceremony here throws "The document is not focused".
        // Capture everything the submit needs (incl. the pending credential, so a mid-flow sign-in
        // can't strand it) and hand off to `finishClaim`, which runs on a button click.
        readyRef.current = {
          proof, entry, mode, claimer, oneStep, credential: oneStep ? pendingAccount : null,
          scope, root, moduleAddress: zkEmailInvitesAddress, orgChainId,
        };
        setReady(true);
        setStep(ZK_CLAIM_STEPS.PROOF_READY);
        return { success: true, proofReady: true };
      } catch (e) {
        return fail(e);
      } finally {
        try { guard(); preparingRef.current = false; } catch { /* New scope owns the lock. */ }
      }
    },
    [
      guard, scope, wait,
      zkEmailInvites,
      zkEmailInvitesAddress,
      zkEmailInvitesEnabled,
      orgChainId,
      accountAddress,
      isAuthenticated,
      pendingAccount,
      recovery,
      onboardingService,
      safeFetchFromIpfs,
      bytes32ToIpfsCid,
      fail,
    ],
  );

  /**
   * Finish a proved claim: sign + submit. MUST be invoked from a user gesture (button click) — the
   * passkey/wallet ceremony needs the fresh user activation that the long proving step consumed.
   * Idempotent-safe: the proof is cached, so a failed attempt can be retried by clicking again.
   */
  const finishClaim = useCallback(
    async () => {
      guard();
      const r = readyRef.current;
      if (!r) return fail(new Error('Upload your verification email first.'));
      if (submittingRef.current) return { success: false }; // already in flight — ignore double-click
      submittingRef.current = true;
      const { proof, entry, mode, claimer, oneStep, credential } = r;
      try {
        // A proof can outlive an org switch or an invite-list update while the user is reading
        // the Finish screen. Never submit its old Merkle path to another module/current root.
        if (r.scope !== scope || r.moduleAddress !== zkEmailInvitesAddress || r.orgChainId !== orgChainId) {
          readyRef.current = null;
          setReady(false);
          return fail(new Error('The org changed. Verify your email again for this org.'));
        }
        if (oneStep && onboardingService.getPendingSubmission(claimer)) {
          throw new Error('Your account setup is awaiting confirmation. Check its status before trying again.');
        }
        const active = await wait(oneStep
          ? onboardingService.getActiveAllowlist()
          : zkEmailInvites.getActiveAllowlist(zkEmailInvitesAddress));
        if (active.root.toLowerCase() !== r.root.toLowerCase()) {
          readyRef.current = null;
          setReady(false);
          return fail(new Error('The org’s email invites changed. Verify your email again to use the current list.'));
        }
        // ONE-STEP: single UserOp — deploy account + register username + claim. Wrapped in
        // executeWithNotification so subgraph-sync + 'role:claimed' fire like the tx-manager path.
        if (oneStep) {
          if (!onboardingService || !credential) {
            return fail(new Error('Account infrastructure is still loading — try again in a moment.'));
          }
          setStep(ZK_CLAIM_STEPS.SIGNING);
          const result = await executeWithNotification(
            async () => {
              guard();
              const rr = await onboardingService.registerAndClaim({
                credential,
                accountAddress: claimer,
                username: credential.username,
                mode,
                proof,
                hatIds: entry.hatIds,
                merkleProof: entry.proof,
                onStep: (s) => { guard(); setStep(s === 'submitting' || s === 'confirming' ? ZK_CLAIM_STEPS.SUBMITTING : ZK_CLAIM_STEPS.SIGNING); },
              });
              return { success: true, blockNumber: rr.blockNumber, txHash: rr.transactionHash };
            },
            {
              pendingMessage: 'Creating your account and claiming your role…',
              successMessage: 'Account created and role claimed!',
              errorMessage: 'Claim failed',
              refreshEvent: 'role:claimed',
              writeSource: { account: claimer, chainId, endpoint: subgraphUrl },
            },
          );
          guard();
          recovery.refreshPending();
          if (!result?.success) {
            setStep(ZK_CLAIM_STEPS.ERROR);
            if (result?.error) setError(result.error);
            if (claimSubmissionUnconfirmed(result?.error)) { readyRef.current = null; setReady(false); }
            return result;
          }
          proofCacheRef.current = null;
          readyRef.current = null;
          setReady(false);
          onConfirmed({ accountAddress: claimer, username: credential.username });
          await activatePasskey({
            credentialId: credential.credentialId,
            rawCredentialId: credential.rawCredentialId,
            publicKeyX: credential.publicKeyX,
            publicKeyY: credential.publicKeyY,
            salt: credential.salt,
            accountAddress: claimer,
            username: credential.username,
            credentialChainId: credential.credentialChainId,
          });
          removePendingCredential(claimer, source);
          return { success: true };
        }

        // Existing account: plain claim via the tx manager (gasless on a passkey). EOA wallets must be
        // on the ORG's chain first — a tx on the wrong chain hits a no-code address and no-ops.
        if (!zkEmailInvites) {
          return fail(new Error('Web3 services are not ready yet — try again in a moment.'));
        }
        if (!isPasskeyUser && orgChainId && connectedChain?.id !== orgChainId) {
          await wait(switchChainAsync({ chainId: orgChainId }));
        }
        setStep(ZK_CLAIM_STEPS.SUBMITTING);
        // CLAIM paymaster subject (0x05) first — the hub sponsors the op bound to the ZkEmailInvites
        // proxy with NO eligibility pre-check (a first-role claimer isn't eligible until the claim
        // itself grants it); entry hats remain as fallback subjects.
        const submit =
          mode === 'email'
            ? () => { guard(); return zkEmailInvites.claimRoleByEmail(zkEmailInvitesAddress, proof, claimer, entry.hatIds, entry.proof, {
                  paymasterClaimTarget: zkEmailInvitesAddress,
                  paymasterHatIds: entry.hatIds,
                }); }
            : () => { guard(); return zkEmailInvites.claimRoleByDomain(zkEmailInvitesAddress, proof, claimer, entry.hatIds, entry.proof, {
                  paymasterClaimTarget: zkEmailInvitesAddress,
                  paymasterHatIds: entry.hatIds,
                }); };
        const result = await executeWithNotification(submit, {
          pendingMessage: 'Claiming your role…',
          successMessage: 'Role claimed!',
          errorMessage: 'Claim failed',
          refreshEvent: 'role:claimed',
        });

        guard();
        if (result?.success) {
          proofCacheRef.current = null;
          readyRef.current = null;
          setReady(false);
          setStep(ZK_CLAIM_STEPS.DONE);
        } else {
          setStep(ZK_CLAIM_STEPS.ERROR);
          if (result?.error) setError(result.error);
          if (claimSubmissionUnconfirmed(result?.error)) { readyRef.current = null; setReady(false); }
        }
        return result;
      } catch (e) {
        return fail(e);
      } finally {
        try { guard(); submittingRef.current = false; } catch { /* A new scope owns the lock. */ }
      }
    },
    [
      guard, scope, wait, recovery, chainId, subgraphUrl, onConfirmed, source,
      onboardingService,
      executeWithNotification,
      activatePasskey,
      zkEmailInvites,
      zkEmailInvitesAddress,
      isPasskeyUser,
      orgChainId,
      connectedChain,
      switchChainAsync,
      fail,
    ],
  );

  // Back-compat alias: the existing flow component calls `claimByDomain`.
  return {
    claim,
    claimScope: scope,
    existingAccountRecovery: isAuthenticated && accountAddress && (txManager || zkEmailInvites?.txManager)
      ? { manager: txManager || zkEmailInvites.txManager, guard, accountAddress } : null,
    claimByDomain: claim,
    finishClaim,
    ready: visibleScope === scope && ready,
    reset,
    step: visibleScope === scope || preservesActivation ? step : ZK_CLAIM_STEPS.IDLE,
    error: visibleScope === scope ? error : null,
    meta: visibleScope === scope || preservesActivation ? meta : null,
    proveProgress: visibleScope === scope ? proveProgress : null,
    // one-step onboarding surface
    pendingAccount,
    ...recovery,
    prepareNewPasskey,
    discardPendingPasskey,
    newAccountReady,
    claimerAddress,
  };
}
