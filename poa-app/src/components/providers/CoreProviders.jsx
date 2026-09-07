import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { AuthProvider } from '@/context/AuthContext';
import { Web3ServicesRuntimeHost } from '@/context/Web3ServicesContext';
import WalletRuntimeBridge from '@/components/providers/WalletRuntimeBridge';
import E2EAutoConnect from '@/services/e2e/E2EAutoConnect';
import {
  rainbowKitAppInfo,
  rainbowKitTheme,
  wagmiConfig,
} from '@/components/providers/web3Config';

const queryClient = new QueryClient();

/** Sibling account island: never wraps or remounts public page state. */
export default function CoreProviders() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          {/* Org routes select their own chain; do not force a home chain. */}
          <RainbowKitProvider theme={rainbowKitTheme} appInfo={rainbowKitAppInfo}>
            <>
              <WalletRuntimeBridge />
              <Web3ServicesRuntimeHost />
              {process.env.NEXT_PUBLIC_E2E_MODE === 'true' && <E2EAutoConnect />}
            </>
          </RainbowKitProvider>
        </QueryClientProvider>
      </AuthProvider>
    </WagmiProvider>
  );
}
