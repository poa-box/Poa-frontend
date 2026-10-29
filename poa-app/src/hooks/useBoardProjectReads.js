import { useCallback, useEffect, useRef, useState } from 'react';
import { readBoardSnapshot } from '@/lib/tasks/projectReads';

/** One host polling lifecycle; failures and old scopes cannot certify empty/current data. */
export function useBoardProjectReads({ client, source, isActive, releasesSupported }) {
  const key = JSON.stringify([source.chainId, source.orgId, source.contract, source.endpoint, releasesSupported]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const generation = useRef(0);
  const mounted = useRef(true);
  const currentClient = useRef(client);
  currentClient.current = client;
  const [state, setState] = useState({ key, loading: true });
  const refetch = useCallback(async (options = {}) => {
    if (!mounted.current || currentKey.current !== key || currentClient.current !== client
        || !source.orgId || !source.contract || !source.endpoint) return null;
    const run = ++generation.current;
    try {
      const snapshot = await readBoardSnapshot({ client, source, releasesSupported,
        minimumBlock: options.minimumBlock });
      if (!mounted.current || currentKey.current !== key || currentClient.current !== client || generation.current !== run) return null;
      setState({ key, loading: false, ...snapshot, error: null });
      return snapshot.result;
    } catch {
      if (!mounted.current || currentKey.current !== key || currentClient.current !== client || generation.current !== run) return null;
      setState(previous => ({ key, loading: false,
        result: previous.key === key ? previous.result : undefined,
        error: new Error('Projects could not finish loading. Please try again.'), managers: undefined,
      }));
      return null;
    }
  }, [client, source, key, releasesSupported]);
  useEffect(() => {
    mounted.current = true;
    setState({ key, loading: true });
    refetch();
    const invalidate = () => { mounted.current = false; generation.current++; };
    return invalidate;
  }, [key, refetch]);
  useEffect(() => {
    if (!isActive) return undefined;
    const timer = setInterval(() => refetch(), 40000);
    return () => clearInterval(timer);
  }, [isActive, refetch]);
  return { ...(state.key === key ? state : { key, loading: true }), refetch };
}
