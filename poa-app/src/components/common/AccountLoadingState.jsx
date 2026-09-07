import { Box, Button, HStack, Spinner, Text } from '@chakra-ui/react';
import { useWalletRuntimeControl } from '@/context/WalletContext';

/** Feedback for an account-dependent section; public content stays available. */
export default function AccountLoadingState() {
  const { runtimeError, retryRuntime } = useWalletRuntimeControl();
  return (
    <Box maxW="sm" w="100%" p={6} borderRadius="xl" bg="#FCFAFF"
      color="warmGray.800" border="1px solid" borderColor="warmGray.200">
      {runtimeError ? (
        <>
          <Text role="alert" fontSize="sm" mb={3}>
            Your account couldn’t finish loading. Please try again.
          </Text>
          <Button size="sm" colorScheme="purple" onClick={retryRuntime}>Try again</Button>
        </>
      ) : (
        <HStack role="status" aria-live="polite" spacing={3}>
          <Spinner size="sm" color="amethyst.500" aria-hidden="true" />
          <Text fontSize="sm">Getting your account ready…</Text>
        </HStack>
      )}
    </Box>
  );
}
