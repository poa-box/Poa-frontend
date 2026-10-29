import { useCallback, useEffect, useRef, useState } from 'react';

/** Demand exists only inside the mounted project provider, never public page readers. */
export function useProjectCreator({ authority, scope, enabled }) {
  const [state, setState] = useState(null);
  const key = JSON.stringify([scope, authority?.source]);
  const current = useRef(); current.current = { key, authority, enabled };
  const generation = useRef(0);
  const mounted = useRef(true);
  const refetch = useCallback(async () => {
    if (!mounted.current || current.current.key !== key || current.current.authority !== authority || !current.current.enabled) return null;
    const run = ++generation.current;
    const assertCurrent = () => {
      if (!mounted.current || current.current.key !== key || current.current.authority !== authority || !current.current.enabled || generation.current !== run) throw new Error('Project permissions changed. Please try again.');
    };
    try {
      assertCurrent();
      setState(null);
      const { readProjectCreator } = await import('@/services/web3/read/projectCreator');
      assertCurrent();
      const result = await readProjectCreator({ authority, scope });
      assertCurrent(); setState({ key, authority, ...result }); return result;
    } catch { if (mounted.current && current.current.key === key && generation.current === run) setState(null); return null; }
  }, [key, authority, scope]);
  useEffect(() => { mounted.current = true; if (enabled) void refetch(); else setState(null); return () => { mounted.current = false; generation.current++; }; }, [enabled, refetch]);
  const value = enabled && state?.key === key && state.authority === authority ? state : null;
  return { ...value, refetch };
}
