import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Alert, AlertIcon, Badge, Box, Button, Heading, HStack, Text, VStack, useDisclosure, useToast } from '@chakra-ui/react';
import SEOHead from '@/components/common/SEOHead';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import AccountControl from '@/components/common/AccountControl';
import AccountLoadingState from '@/components/common/AccountLoadingState';
import { JoinLayout, JoinAccountStart, JoinInvitationStart } from '@/components/join/JoinPresentation';
import useOnboardingColors from '@/components/shared/useOnboardingColors';
import SignInModal from '@/components/passkey/SignInModal';
import SolidarityOnboardingModal from '@/components/passkey/SolidarityOnboardingModal';
import PasskeyOnboardingModal from '@/components/passkey/PasskeyOnboardingModal';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { subjectHoldsPerm } from '@/lib/voting/createGate';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';
import SignupModal from '@/components/account/SignupModal';
import SubjectVouchPanel from '@/components/accessV2/SubjectVouchPanel';
import EmailInviteCard from '@/components/zkEmail/EmailInviteCard';
import PulseLoader from '@/components/shared/PulseLoader';
import { useOrgGate } from '@/components/shared/OrgDeadEnd';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useAuthorityActions } from '@/hooks/accessV2';
import { useAuthorityJoinRoles } from '@/hooks/useAuthorityJoinRoles';
import { joinRoleState } from '@/lib/accessV2/joinRoles';
import { orgUrl } from '@/util/orgUrl';
import { shareUrl } from '@/util/shortLinks';
import useIpfsImage from '@/hooks/useIpfsImage';
import { useZkEmailInviteSummary } from '@/hooks/useZkEmailInviteSummary';

export default function JoinPage() {
  const router = useRouter();
  const orgGate = useOrgGate({
    notFoundTitle: () => 'That invite points to an organization we can’t find',
    notFoundBody: 'Names are case-sensitive, and a brand-new org can take a minute to appear. Ask whoever shared the link to check it, or browse the organizations that are live now.',
  });
  const { orgName, poDescription, quickJoinContractAddress, logoUrl } = usePOContext();
  const orgLogoSrc = useIpfsImage(logoUrl);
  const colors = useOnboardingColors();
  const { isAuthenticated, accountAddress, isAuthHydrated } = useAuth();
  const { graphUsername } = useUserContext();
  const { roles, authority, loading, error, states, refetch } = useAuthorityJoinRoles();
  const { claim, isBusy } = useAuthorityActions();
  const [claimError, setClaimError] = useState(null);
  const [joining, setJoining] = useState(false);
  const { organization, executeWithNotification, isReady } = useWeb3();
  const autoJoinRoles = roles.filter(role => subjectHoldsPerm(role, PERM_KEYS.QJ_AUTOJOIN));
  const canAutoJoin = autoJoinRoles.length > 0 && autoJoinRoles.every(role => joinRoleState(states[role.subjectId]).canClaim);
  const hasVouchGatedRoles = roles.some(role => role.vouchConfig?.quorum > 0);
  const requiresInvitation = autoJoinRoles.length === 0 && !hasVouchGatedRoles && !roles.some(role => role.defaultAllow === true);
  const inviteSummary = useZkEmailInviteSummary();
  const canClaimWithEmail = inviteSummary.status === 'active' || inviteSummary.status === 'degraded';
  const membershipLoading = loading || authority.loading;
  const membershipError = error || authority.error;
  const canChangeMembership = isAuthHydrated && isAuthenticated && accountAddress && authority.enabled && !authority.paused && !membershipLoading && !membershipError;
  const signIn = useDisclosure();
  const createAccount = useDisclosure();
  const username = useDisclosure();
  const toast = useToast();
  // Adopted role IDs keep old invite links useful; all writes go to the authority.
  const invitedSubject = String(router.query.subjectId || router.query.hatId || '');
  const inviteUser = typeof router.query.vouch === 'string' && /^0x[0-9a-f]{40}$/i.test(router.query.vouch)
    ? router.query.vouch : null;

  const join = async role => {
    if (!canChangeMembership || !joinRoleState(states[role.subjectId]).canClaim) return;
    setClaimError(null);
    const result = await claim(role.subjectId, role.name);
    if (result?.success) refetch();
    else if (result?.error) setClaimError(result.error.message);
  };
  const joinOrganization = async () => {
    if (!organization || !isReady || !quickJoinContractAddress || !canChangeMembership || !canAutoJoin) return;
    setJoining(true);
    try {
      const result = await executeWithNotification(() => organization.quickJoinWithUser(quickJoinContractAddress, {
        paymasterHatIds: autoJoinRoles.map(role => role.subjectId),
      }), { pendingMessage: 'Joining organization…', successMessage: 'You joined the organization.', refreshEvent: 'member:joined' });
      if (result?.success) refetch();
      else if (result?.error) setClaimError(result.error.message);
    } finally { setJoining(false); }
  };
  const share = async role => {
    if (!isAuthHydrated || !isAuthenticated || !accountAddress || !authority.enabled) return;
    try {
      // The short-link codec retains adopted ids under hatId; JoinPage accepts both aliases.
      const link = await shareUrl('/join/', { org: orgName, hatId: role.subjectId, vouch: accountAddress });
      await navigator.clipboard.writeText(link);
      toast({ title: 'Vouch link copied', description: 'Share it with a member who can vouch for this role.', status: 'success' });
    } catch {
      toast({ title: 'Could not copy the link', status: 'error' });
    }
  };

  if (orgGate) return orgGate;
  return (
    <>
      <SEOHead title={`Join ${orgName}`} description={poDescription} path="/join" />
      <Navbar />
      <JoinLayout
        orgName={orgName}
        orgLogoSrc={orgLogoSrc}
        isVouching={Boolean(inviteUser && invitedSubject)}
        isAuthenticated={isAuthenticated}
        account={isAuthHydrated && isAuthenticated ? <Box bg="gray.800" borderRadius="lg"><AccountControl label="Account" /></Box> : null}
        cardLabel={requiresInvitation ? 'Membership' : undefined}
        invite={isAuthHydrated && authority.enabled && !requiresInvitation && canClaimWithEmail && <EmailInviteCard variant="join" summary={inviteSummary} />}
      >
        {!isAuthHydrated ? <AccountLoadingState /> : membershipLoading ? (
          <VStack spacing={4}><PulseLoader /><Text color={colors.muted}>Loading membership options…</Text></VStack>
        ) : membershipError || !authority.enabled ? (
          <JoinInvitationStart orgName={orgName} status="unknown" hasError onRetry={refetch} isAuthenticated={isAuthenticated} onSignIn={signIn.onOpen} />
        ) : (
          <VStack align="stretch" spacing={6}>
            {authority.paused && <Alert status="info" borderRadius="lg"><AlertIcon />Membership changes are paused. You can still view the roles.</Alert>}
            {claimError && <Alert status="error" borderRadius="lg"><AlertIcon />{claimError}</Alert>}
            {isAuthenticated ? (
              <VStack align="stretch" spacing={3}>
                <Heading as="h2" fontSize="2xl">Your membership</Heading>
                {graphUsername && autoJoinRoles.length > 0 && <Button colorScheme="amethyst" isDisabled={!canAutoJoin || !canChangeMembership || !quickJoinContractAddress || !isReady} isLoading={joining} onClick={joinOrganization}>Join organization</Button>}
                {!graphUsername && <Button variant="outline" onClick={username.onOpen}>Choose a username</Button>}
                <Button variant="outline" onClick={() => router.push(orgUrl(orgName, 'profile'))}>View your profile</Button>
              </VStack>
            ) : !requiresInvitation ? (
              <JoinAccountStart orgName={orgName} roleName={autoJoinRoles.length === 1 ? autoJoinRoles[0].name : undefined} onCreate={createAccount.onOpen} onSignIn={signIn.onOpen} isDisabled={authority.paused} />
            ) : null}
            {requiresInvitation && (
              <JoinInvitationStart
                orgName={orgName} status={inviteSummary.status} onClaim={() => router.push(orgUrl(orgName, 'claim'))}
                onRetry={inviteSummary.refresh} isAuthenticated={isAuthenticated} onSignIn={signIn.onOpen}
              >
                <EmailInviteCard variant="join-details" summary={inviteSummary} />
              </JoinInvitationStart>
            )}
            <Box borderTop="1px solid" borderColor={colors.line} pt={5}>
              <HStack justify="space-between" mb={4} flexWrap="wrap">
                <Heading as="h2" size="sm">Choose a role</Heading>
                {isAuthenticated && <Button size="sm" variant="outline" onClick={refetch}>Refresh eligibility</Button>}
              </HStack>
              <VStack align="stretch" spacing={4}>
                {!roles.length && <Text color={colors.muted}>No roles are available yet.</Text>}
                {roles.map(role => {
                  const state = joinRoleState(states[role.subjectId]);
                  const showVouches = role.vouchConfig?.quorum > 0;
                  const target = invitedSubject === role.subjectId && inviteUser ? inviteUser : accountAddress;
                  return (
                    <Box key={role.subjectId} border="1px solid" borderColor={colors.line} borderRadius="lg" p={4}>
                      <VStack align="stretch" spacing={3}>
                        <HStack justify="space-between">
                          <Text fontWeight="600">{role.name}</Text>
                          {state.isMember && <Badge colorScheme="green">Member</Badge>}
                        </HStack>
                        {isAuthenticated ? <>
                          <Text fontSize="sm" color={colors.muted}>{state.message}</Text>
                          {!state.isMember && <Button colorScheme="amethyst" isDisabled={!state.canClaim || !canChangeMembership} isLoading={isBusy(`claim:${role.subjectId}`)} onClick={() => join(role)}>Join {role.name}</Button>}
                          {showVouches && <Button variant="outline" onClick={() => share(role)}>Copy your vouch link</Button>}
                        </> : <Text fontSize="sm" color={colors.muted}>Sign in to check whether you can join this role.</Text>}
                        {showVouches && target && <SubjectVouchPanel subjectId={role.subjectId} user={target} />}
                      </VStack>
                    </Box>
                  );
                })}
              </VStack>
            </Box>
          </VStack>
        )}
      </JoinLayout>
      <SignInModal variant="join" isOpen={signIn.isOpen} onClose={signIn.onClose} onSuccess={refetch} onCreateAccount={!requiresInvitation && authority.enabled ? () => { signIn.onClose(); createAccount.onOpen(); } : undefined} />
      {autoJoinRoles.length > 0 && quickJoinContractAddress ? (
        <PasskeyOnboardingModal variant="join" showWalletOption isOpen={createAccount.isOpen} onClose={createAccount.onClose} paymasterHatId={autoJoinRoles[0].subjectId} onSuccess={() => { createAccount.onClose(); refetch(); }} />
      ) : (
        <SolidarityOnboardingModal isOpen={createAccount.isOpen} onClose={createAccount.onClose} onSuccess={() => { createAccount.onClose(); refetch(); }} />
      )}
      <SignupModal isOpen={username.isOpen} onClose={username.onClose} />
    </>
  );
}
