import { useLayoutEffect } from 'react';
import { useWeb3ServicesRuntime } from '@/hooks/useWeb3ServicesRuntime';

/** Loaded once when an account-service consumer mounts; never wraps readers. */
export default function Web3ServicesRuntime({ scope, guard, publish }) {
  const services = useWeb3ServicesRuntime({ guard });
  useLayoutEffect(() => {
    publish({ scope, services });
  }, [scope, services, publish]);
  return null;
}
