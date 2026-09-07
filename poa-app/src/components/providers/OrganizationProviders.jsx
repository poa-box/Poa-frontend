import { Web3ServicesProvider } from '@/context/Web3ServicesContext';
import AccountRuntimeHost from '@/components/providers/AccountRuntimeHost';
import NetworkModalControl from '@/components/NetworkModalControl';
import dynamic from 'next/dynamic';
import { UserProvider } from '@/context/UserContext';
import { VotingProvider } from '@/context/VotingContext';
import { Web3Provider } from '@/context/web3Context';
import DeferredTourPrompt from '@/components/providers/DeferredTourPrompt';
import { TourProvider, useTour } from '@/features/tour/TourContext';

const TourOverlay = dynamic(() => import('@/features/tour/components/TourOverlay'), { ssr: false });

// The overlay's sharing tools are only needed during a tour. Loading them on
// every org entry pulls transaction services into the initial provider bundle.
function ActiveTourOverlay() {
  const { isActive } = useTour();
  return isActive ? <TourOverlay /> : null;
}

/** Stable application state. Wallet startup is a sibling, never a page wrapper. */
export default function OrganizationProviders({ children, enabled = true }) {
  return (
    <VotingProvider>
      <UserProvider>
        <Web3ServicesProvider>
          <Web3Provider>
            <TourProvider>
              {enabled && <NetworkModalControl />}
              {enabled && <ActiveTourOverlay />}
              {enabled && <DeferredTourPrompt />}
              {children}
              <AccountRuntimeHost />
            </TourProvider>
          </Web3Provider>
        </Web3ServicesProvider>
      </UserProvider>
    </VotingProvider>
  );
}
