import { lazy, Suspense, useState } from 'react';
import { Button, Center, Text, VStack } from '@chakra-ui/react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import CommunityLoadingState from '@/components/shared/CommunityLoadingState';

/**
 * Keep the route entry small so organization reads can start immediately.
 * _app preloads the active page alongside its providers, without downloading
 * every application feature when Next prefetches a navigation link.
 */
export default function deferredApplicationPage(importPage, seo) {
  let pending;
  const preload = () => {
    if (!pending) {
      pending = Promise.resolve().then(importPage).catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  function DeferredPage(props) {
    const [Page, setPage] = useState(() => lazy(preload));
    return (
      <ErrorBoundary fallback={({ reset }) => (
        <Center minH="70vh" p={6}>
          <VStack spacing={4} role="alert">
            <Text>We couldn’t open this page. Please try again.</Text>
            <Button onClick={() => {
              // React.lazy caches rejections; a fresh identity makes a failed
              // network request retryable without replacing any providers.
              setPage(lazy(preload));
              reset();
            }}>
              Try again
            </Button>
          </VStack>
        </Center>
      )}>
        <Suspense fallback={<CommunityLoadingState fullScreen label="Opening Poa…" />}>
          <Page {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  DeferredPage.preload = preload;
  // Rendered above asynchronous providers, including in the static export.
  DeferredPage.seo = seo;
  return DeferredPage;
}
