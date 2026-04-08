import { ChakraProvider, extendTheme, CSSReset } from "@chakra-ui/react";
import { IPFSprovider } from "@/context/ipfsContext";
import { Web3Provider } from "@/context/web3Context";
import { DataBaseProvider } from "@/context/dataBaseContext";
import { ProfileHubProvider } from "@/context/profileHubContext";
import { ProjectProvider } from "@/context/ProjectContext";
import { UserProvider } from "@/context/UserContext";
import { POProvider } from "@/context/POContext";
import { VotingProvider } from "@/context/VotingContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { RefreshProvider } from "@/context/RefreshContext";
import { AuthProvider } from "@/context/AuthContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { TourProvider, TourOverlay, TourPrompt } from "@/features/tour";
import '@rainbow-me/rainbowkit/styles.css';
import '../styles/globals.css';
import '/public/css/prism.css';
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { defineChain } from 'viem';
import { NETWORKS, DEFAULT_NETWORK } from '../config/networks';

// Build viem chains for ALL supported networks (needed for useSwitchChain)
const allChains = Object.values(NETWORKS).map(cfg => defineChain({
  id: cfg.chainId,
  name: cfg.name,
  nativeCurrency: cfg.nativeCurrency,
  rpcUrls: { default: { http: [cfg.rpcUrl] } },
  blockExplorers: { default: { name: 'Explorer', url: cfg.blockExplorer } },
}));
const defaultChain = allChains.find(c => c.id === NETWORKS[DEFAULT_NETWORK].chainId);
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query";

import NetworkModalControl from "@/components/NetworkModalControl";
import { ApolloProvider } from '@apollo/client';
import client from '../util//apolloClient';
import Notification from '@/components/Notifications';



const queryClient = new QueryClient();
const config = getDefaultConfig({
  appName: 'Poa',
  projectId: '7dc7409d6ef96f46e91e9d5797e4deac',
  chains: allChains,
  ssr: true,
});


const theme = extendTheme({
  fonts: {
    heading: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'Roboto Mono', monospace",
  },
  colors: {
    // Primary - Warm Coral (action, warmth)
    coral: {
      50: '#FFF5F2',
      100: '#FFE8E1',
      200: '#FFD0C2',
      300: '#FFB299',
      400: '#FF8F6B',
      500: '#F06543',
      600: '#D64E2C',
      700: '#B33B1D',
      800: '#8C2E17',
      900: '#6B2412',
    },
    // Secondary - Soft Rose (warmth, approachability)
    rose: {
      50: '#FFF5F7',
      100: '#FFE8ED',
      200: '#FFD1DC',
      300: '#FFB3C4',
      400: '#FF8FA8',
      500: '#E85D85',
      600: '#CC4570',
      700: '#A83658',
      800: '#852944',
      900: '#661F34',
    },
    // Accent - Warm Amethyst (governance, creativity)
    amethyst: {
      50: '#F9F5FF',
      100: '#F0E5FF',
      200: '#E0CCFF',
      300: '#C9A8FF',
      400: '#B080FF',
      500: '#9055E8',
      600: '#7340CC',
      700: '#5A2FA8',
      800: '#452485',
      900: '#331A66',
    },
    // Neutral - Warm Gray (not blue-gray)
    warmGray: {
      50: '#FAFAF9',
      100: '#F5F4F2',
      200: '#E8E6E3',
      300: '#D6D3CE',
      400: '#B5B1A9',
      500: '#8F8A80',
      600: '#6B665C',
      700: '#4D4943',
      800: '#33302C',
      900: '#1F1D1A',
    },
  },
  styles: {
    global: {
      body: {
        bgGradient: "linear(135deg, #FFF5F0 0%, #FDF2F8 50%, #F5F3FF 100%)",
        color: "warmGray.900",
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: '500',
        borderRadius: 'lg',
      },
      variants: {
        primary: {
          bg: 'coral.500',
          color: 'white',
          _hover: {
            bg: 'coral.600',
            transform: 'translateY(-1px)',
            boxShadow: 'md',
          },
          _active: {
            bg: 'coral.700',
            transform: 'translateY(0)',
          },
        },
        glass: {
          bg: 'rgba(255, 255, 255, 0.8)',
          border: '1px solid',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          _hover: {
            bg: 'rgba(255, 255, 255, 0.9)',
          },
        },
      },
    },
    Card: {
      variants: {
        glass: {
          container: {
            bg: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.18)',
            boxShadow: '0 4px 30px rgba(0, 0, 0, 0.05)',
          },
        },
        elevated: {
          container: {
            bg: 'white',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04), 0 4px 8px rgba(0, 0, 0, 0.06)',
            border: '1px solid',
            borderColor: 'warmGray.100',
          },
        },
      },
    },
    Input: {
      variants: {
        glass: {
          field: {
            bg: 'rgba(255, 255, 255, 0.75)',
            border: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            _focus: {
              bg: 'rgba(255, 255, 255, 0.8)',
              borderColor: 'coral.400',
              boxShadow: '0 0 0 3px rgba(240, 101, 67, 0.15)',
            },
          },
        },
      },
    },
  },
});

import React, { useMemo } from 'react';

// Provider tree wrapped in React.memo. Only re-renders when `children` changes.
// Since `children` is a memoized page element (see MyApp), this prevents wagmi's
// Hydrate/reconnect store updates from cascading through all nested providers.
const StableProviders = React.memo(function StableProviders({ children }) {
  return (
    <AuthProvider>
      <ApolloProvider client={client}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider initialChain={defaultChain}>
            <RefreshProvider>
            <IPFSprovider>
              <ProfileHubProvider>
                <POProvider>
                  <VotingProvider>
                    <ProjectProvider>
                      <UserProvider>
                        <NotificationProvider>
                          <Web3Provider>
                            <DataBaseProvider>
                              <ChakraProvider theme={theme}>
                                <TourProvider>
                                  <NetworkModalControl />
                                  <Notification />
                                  <TourOverlay />
                                  <TourPrompt />
                                  {children}
                                </TourProvider>
                              </ChakraProvider>
                            </DataBaseProvider>
                          </Web3Provider>
                        </NotificationProvider>
                      </UserProvider>
                    </ProjectProvider>
                  </VotingProvider>
                </POProvider>
              </ProfileHubProvider>
            </IPFSprovider>
            </RefreshProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </ApolloProvider>
    </AuthProvider>
  );
});

function MyApp({ Component, pageProps }) {
  // Memoize the page element so it's a stable reference across wagmi-triggered
  // re-renders. Only recreated on actual page navigation (Component change).
  // pageProps excluded from deps — always {} in this static-export app (no
  // getServerSideProps/getStaticProps), so the spread is a no-op.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const page = useMemo(() => (
    <Component {...pageProps} />
  ), [Component]);

  return (
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <StableProviders>
          {page}
        </StableProviders>
      </WagmiProvider>
    </ErrorBoundary>
  );
}

export default MyApp;
