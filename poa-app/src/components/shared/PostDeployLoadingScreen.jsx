import { useState, useEffect } from 'react';
import { Button, Text, VStack } from '@chakra-ui/react';
import CommunityLoadingState from '@/components/shared/CommunityLoadingState';

const TIMEOUT_SECONDS = 60;

export default function PostDeployLoadingScreen({ orgName }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setTimedOut(true), TIMEOUT_SECONDS * 1000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <CommunityLoadingState
      fullScreen
      label={timedOut ? 'Taking a little longer than expected' : `Preparing ${orgName || 'your organization'}…`}
      description={timedOut
        ? 'Your organization was created. It needs a little more time to appear here.'
        : 'Your organization was created. We’re getting it ready for you.'}
    >
      {timedOut && (
        <VStack spacing={3}>
          <Button
            size="md"
            bg="amethyst.500"
            color="white"
            _hover={{ bg: 'amethyst.600' }}
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </Button>
          <Text fontSize="xs" color="inherit">
            This usually resolves within a couple of minutes
          </Text>
        </VStack>
      )}
    </CommunityLoadingState>
  );
}
