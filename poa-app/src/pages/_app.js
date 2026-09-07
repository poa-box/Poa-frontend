import { useEffect, useState } from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { LandingAccountProvider, useLandingCoreReady } from '@/components/marketing/LandingAccountContext';
import { WalletFacadeProvider } from '@/context/WalletContext';
import { AuthFacadeProvider } from '@/context/authState';
import CommunityLoadingState from '@/components/shared/CommunityLoadingState';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import ShortLinkRouter from '@/components/common/ShortLinkRouter';
import SEOHead from '@/components/common/SEOHead';
import { PUBLIC_ROUTES, REGISTRY_ONLY_ROUTES, CORE_ONLY_ROUTES, SSR_APP_ROUTES } from '@/lib/applicationRoutes.mjs';
import '@rainbow-me/rainbowkit/styles.css';
import '../styles/globals.css';
import '/public/css/prism.css';

const PublicCoreProviders = dynamic(
  () => import('@/components/providers/PublicCoreProviders'),
  { loading: CoreLoadingState },
);
const OrganizationReadProviders = dynamic(
  () => import('@/components/providers/OrganizationReadProviders'),
  { loading: CoreLoadingState },
);
const LandingAccountBridge = dynamic(
  () => import('@/components/marketing/LandingAccountBridge'),
  { ssr: false },
);
const OrganizationProviders = dynamic(
  () => import('@/components/providers/OrganizationProviders'),
  { loading: () => <CommunityLoadingState fullScreen label="Opening Poa…" /> },
);
const RegistryProvider = dynamic(
  () => import('@/components/providers/RegistryProvider'),
  { loading: () => <CommunityLoadingState fullScreen label="Opening Poa…" /> },
);


const theme = extendTheme({
  fonts: {
    heading: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'IBM Plex Mono', monospace",
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

function CoreLoadingState() {
  const { pathname } = useRouter();
  return pathname === '/' ? null : <CommunityLoadingState fullScreen label="Opening Poa…" />;
}

function PageProviders({ page, pathname, preparePage }) {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);
  const isLanding = pathname === '/';
  const coreReady = useLandingCoreReady(isLanding);
  const isPublic = PUBLIC_ROUTES.has(pathname) || REGISTRY_ONLY_ROUTES.has(pathname);

  useEffect(() => {
    if (isPublic || (isLanding && !coreReady)) return;
    // Download the independent provider layers together. Their render nesting
    // still enforces dependencies, without turning it into a network waterfall.
    const pending = [
      import('@/components/providers/PublicCoreProviders'),
      import('@/components/providers/OrganizationReadProviders'),
      import('@/components/providers/OrganizationProviders'),
    ];
    // The mounted load boundary owns error presentation; speculative requests
    // must not produce an unhandled rejection if a chunk request fails.
    Promise.allSettled(pending);
  }, [isPublic, isLanding, coreReady, pathname]);

  // Static pages never initialize the application providers. The registry stays
  // at the same position on landing, directory and organization routes so its
  // public cache is shared rather than duplicated in the account tree.
  if (PUBLIC_ROUTES.has(pathname)) return page;

  const isOrganization = !isLanding && !isPublic && !CORE_ONLY_ROUTES.has(pathname);
  return (
    <RegistryProvider>
      {(isLanding || isPublic) ? page : null}
      {!isPublic && (!isLanding || coreReady) && (
        <WalletFacadeProvider>
          <AuthFacadeProvider>
            <PublicCoreProviders>
              <OrganizationReadProviders enabled={isOrganization}>
                {/* Keep public reads early without adding the interactive
                    provider scripts to every organization's hydration gate.
                    This changes once on entry, never on account readiness. */}
                {!hasMounted && !SSR_APP_ROUTES.has(pathname) ? <CoreLoadingState /> : (
                  <OrganizationProviders enabled={isOrganization} preparePage={preparePage}>
                    {isLanding ? <LandingAccountBridge /> : page}
                  </OrganizationProviders>
                )}
              </OrganizationReadProviders>
            </PublicCoreProviders>
          </AuthFacadeProvider>
        </WalletFacadeProvider>
      )}
    </RegistryProvider>
  );
}

function MyApp({ Component, pageProps, router }) {
  useEffect(() => {
    Component.preload?.().catch(() => {});
  }, [Component]);

  return (
    <ErrorBoundary>
      <ChakraProvider theme={theme}>
        <LandingAccountProvider>
          <ShortLinkRouter>
            {Component.seo && <SEOHead {...Component.seo} />}
            <PageProviders page={<Component {...pageProps} />} pathname={router?.pathname} preparePage={Component.preload} />
          </ShortLinkRouter>
        </LandingAccountProvider>
      </ChakraProvider>
    </ErrorBoundary>
  );
}

export default MyApp;
