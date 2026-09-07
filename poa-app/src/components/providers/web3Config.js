import {
  connectorsForWallets,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import {
  braveWallet,
  coinbaseWallet,
  frameWallet,
  injectedWallet,
  rabbyWallet,
  safeWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import { base } from 'viem/chains';
import { NETWORKS } from '@/config/networks';
import { burnerConnector } from '@/services/e2e/burnerConnector';
import { deferEmptyCoinbaseProbe } from '@/lib/wallet/coinbaseStartup';

// Base is included for the cash-out withdrawal flow, but intentionally stays
// outside NETWORKS so it cannot be selected for organization/subgraph routing.
const chains = [
  ...Object.values(NETWORKS).map((network) => defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: {
      default: { name: 'Explorer', url: network.blockExplorer },
    },
  })),
  base,
];

// Injected-first wallet list. EIP-6963 supplies installed wallets without a
// WalletConnect dependency; explicit entries provide install CTAs/fallbacks.
const connectors = connectorsForWallets(
  [
    { groupName: 'Recommended', wallets: [injectedWallet, coinbaseWallet] },
    { groupName: 'Privacy', wallets: [braveWallet, rabbyWallet, frameWallet] },
    { groupName: 'Other', wallets: [safeWallet] },
  ],
  { appName: 'Poa', projectId: '' },
);

const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
);

export const wagmiConfig = createConfig({
  connectors: process.env.NEXT_PUBLIC_E2E_MODE === 'true' ? [burnerConnector()] : connectors.map((connector) => deferEmptyCoinbaseProbe(
    connector,
    () => wagmiConfig.state,
    () => typeof window === 'undefined' ? undefined : window,
  )),
  chains,
  transports,
  ssr: true,
  multiInjectedProviderDiscovery: process.env.NEXT_PUBLIC_E2E_MODE !== 'true',
});

export const rainbowKitTheme = darkTheme({
  accentColor: '#F06543',
  accentColorForeground: 'white',
  borderRadius: 'large',
  fontStack: 'system',
  overlayBlur: 'small',
});

export const rainbowKitAppInfo = {
  appName: 'Poa',
  learnMoreUrl: 'https://poa.box',
};
