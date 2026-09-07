import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Text, Box } from '@chakra-ui/react';
import { useWalletUI } from '@/context/WalletContext';

/** An account intent can be cancelled while its runtime downloads. */
export function useWalletAction(action, { enabled = true } = {}) {
  const { preloadRuntime, runtimeError, retryRuntime } = useWalletUI();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const controllerRef = useRef(null);
  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPending(false);
    setError(false);
  }, []);
  useEffect(() => {
    if (!enabled) cancel();
    return () => controllerRef.current?.abort();
  }, [enabled, cancel]);
  const run = useCallback(async () => {
    if (!enabled || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setError(false);
    try {
      if (runtimeError) retryRuntime();
      await action({ signal: controller.signal });
    } catch (cause) {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) {
        controllerRef.current = null;
        setPending(false);
      }
    }
  }, [action, enabled, runtimeError, retryRuntime]);
  const prepare = useCallback(() => {
    Promise.resolve(preloadRuntime()).catch(() => {});
  }, [preloadRuntime]);
  return { run, prepare, pending, error, cancel };
}

/** Local feedback belongs to the control that requested the account action. */
export default function WalletActionButton({ action, children, ...props }) {
  const intent = useWalletAction(action);
  return (
    <Box>
      <Button {...props} onMouseEnter={intent.prepare} onFocus={intent.prepare}
        onClick={intent.run} isLoading={intent.pending} loadingText="Opening…">
        {intent.error ? 'Try again' : children}
      </Button>
      {intent.error && <Text role="alert" fontSize="xs" mt={1}>Couldn’t open your account. Please try again.</Text>}
    </Box>
  );
}
