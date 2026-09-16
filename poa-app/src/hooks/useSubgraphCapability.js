import { useEffect, useState } from 'react';
import { hasCapability, peekCapability } from '@/util/subgraphCapabilities';

/** Never render a new endpoint using the previous endpoint's schema answer. */
export function useSubgraphCapability(subgraphUrl, capability) {
  const [settled, setSettled] = useState(null);
  const cached = peekCapability(subgraphUrl, capability);
  const current = settled?.url === subgraphUrl && settled?.capability === capability;
  const supported = cached ?? (current ? settled.supported : false);

  useEffect(() => {
    if (!subgraphUrl) return undefined;
    let cancelled = false;
    hasCapability(subgraphUrl, capability).then((supported) => {
      if (!cancelled) setSettled({ url: subgraphUrl, capability, supported: !!supported });
    });
    return () => { cancelled = true; };
  }, [subgraphUrl, capability]);

  return supported === true;
}
