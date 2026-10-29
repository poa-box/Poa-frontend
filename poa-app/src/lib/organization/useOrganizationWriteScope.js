import { useCallback, useEffect, useRef } from 'react';

/** Every account/org/chain/manager change invalidates a pending settings action. */
export function useOrganizationWriteScope({ orgId, chainId, account, factory, txManager }) {
  const current = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const parts = [orgId, chainId, account?.toLowerCase(), factory, txManager];
  if (!current.current || parts.some((part, index) => part !== current.current.parts[index])) {
    current.current = { parts };
  }
  return useCallback(() => {
    const captured = current.current;
    const isCurrent = () => mounted.current && current.current === captured;
    return {
      isCurrent,
      assertCurrent: () => {
        if (!isCurrent()) throw new Error('The organization or account changed. Please try again.');
      },
    };
  }, []);
}
