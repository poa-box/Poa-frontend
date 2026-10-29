import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDisclosure } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useAccount } from '@/context/WalletContext';
import { useQuery } from '@apollo/client';
import { useWalletUI } from '@/context/WalletContext';
import { useLandingAccount } from '@/components/marketing/LandingAccountContext';
import { useGlobalAccount } from '@/hooks/useGlobalAccount';
import { useAuth } from '@/context/authState';
import { FETCH_SOLIDARITY_FUND_STATUS } from '@/util/passkeyQueries';

const SignupModal = dynamic(() => import('@/components/account/SignupModal'), { ssr: false });
const SolidarityOnboardingModal = dynamic(() => import('@/components/passkey/SolidarityOnboardingModal'), { ssr: false });
const SignInModal = dynamic(() => import('@/components/passkey/SignInModal'), { ssr: false });

// This subtree lives inside the SAME CoreProviders instance as org pages.
export default function LandingAccountBridge() {
  const { setAccountNav, isSignInOpen, setIsSignInOpen } = useLandingAccount();
  const router = useRouter();
  const { isConnected } = useAccount();
  const { openConnectModal, preloadRuntime } = useWalletUI();
  const { hasAccount, isUnavailable, isLoading: isAccountLoading, refetchAccount } = useGlobalAccount();
  const { isPasskeyUser, isAuthenticated, hasStoredPasskey, isAuthHydrated } = useAuth();
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const { isOpen: isOnboardingOpen, onOpen: onOnboardingOpen, onClose: onOnboardingClose } = useDisclosure();
  const { data: solidarityData } = useQuery(FETCH_SOLIDARITY_FUND_STATUS);
  const solidarityBalance = solidarityData?.paymasterHubContracts?.[0]?.solidarityBalance;
  let solidarityAvailable = false;
  try { solidarityAvailable = solidarityBalance != null && BigInt(solidarityBalance) > 0n; } catch { /* Unavailable is not an observed zero. */ }
  const showSolidarityOnboarding = !isPasskeyUser && !isConnected && !hasStoredPasskey && solidarityAvailable;

  const accountMenuItem = useMemo(() => {
    if (!isAuthHydrated) return { text: 'Account', onClick: () => setIsSignInOpen(true) };
    if ((isConnected || isAuthenticated) && isAccountLoading) {
      return { text: 'Loading', onClick: () => {} };
    }
    if ((isConnected || isAuthenticated) && hasAccount !== true && (hasAccount == null || isUnavailable)) {
      return { text: 'Account unavailable · retry', onClick: refetchAccount };
    }
    if (isPasskeyUser) {
      return { text: 'My account', onClick: () => router.push('/account') };
    }
    if (!isConnected && showSolidarityOnboarding) {
      return { text: 'Create account', onClick: onOnboardingOpen };
    }
    if (!isConnected) {
      return { text: 'Connect', onClick: openConnectModal };
    }
    if (isAccountLoading) {
      return { text: 'Loading', onClick: () => {} };
    }
    if (hasAccount === true) {
      return { text: 'My account', onClick: () => router.push('/account') };
    }
    if (hasAccount === null || isUnavailable) {
      return { text: 'Account unavailable · retry', onClick: refetchAccount };
    }
    return { text: 'Sign up', onClick: () => setIsSignupOpen(true) };
  }, [isAuthHydrated, setIsSignInOpen, isPasskeyUser, isAuthenticated, isConnected, showSolidarityOnboarding, isAccountLoading, hasAccount, isUnavailable, refetchAccount, onOnboardingOpen, openConnectModal, router]);

  useEffect(() => {
    setAccountNav({ preloadRuntime: () => { preloadRuntime().catch(() => {}); }, isAuthHydrated, isPasskeyUser, isConnected, isAuthenticated, accountMenuItem });
  }, [setAccountNav, preloadRuntime, isAuthHydrated, isPasskeyUser, isConnected, isAuthenticated, accountMenuItem]);

  return (
    <>
      {isSignupOpen && <SignupModal isOpen onClose={() => setIsSignupOpen(false)} />}
      {isOnboardingOpen && (
        <SolidarityOnboardingModal
          isOpen
          onClose={onOnboardingClose}
          onSuccess={() => router.push('/account')}
        />
      )}
      {isSignInOpen && (
        <SignInModal
          isOpen
          onClose={() => setIsSignInOpen(false)}
          onSuccess={() => router.push('/account')}
          onCreateAccount={onOnboardingOpen}
        />
      )}
    </>
  );
}
