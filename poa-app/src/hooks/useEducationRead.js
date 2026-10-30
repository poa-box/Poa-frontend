import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Education-only lifecycle; incomplete reads never replace a known library/history. */
export function useEducationRead({ client, chainId, endpoint, orgId, hub, account, kind,
  enabled = true, safeFetchFromIpfs, isActive = false }) {
  const ready = !!(enabled && client && chainId && endpoint && orgId && hub && (kind !== 'completions' || account));
  const source = useMemo(() => ({ chainId, endpoint, orgId, contract: hub,
    ...(kind === 'completions' ? { account } : {}), indexed: true, snapshot: 'latest', method: `education:${kind}`,
  }), [chainId, endpoint, orgId, hub, account, kind]);
  const key = JSON.stringify([ready, chainId, endpoint, orgId, hub, kind, kind === 'completions' ? account : null]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const lifecycle = useRef({ generation: 0, active: false });
  const [state, setState] = useState({ key, loading: ready });

  const refetch = useCallback(async () => {
    const life = lifecycle.current;
    if (!ready || !life.active || currentKey.current !== key) return;
    const generation = ++life.generation;
    const current = () => life.active && life.generation === generation && currentKey.current === key;
    setState(previous => ({ ...(previous.key === key ? previous : {}), key, loading: true }));
    let snapshot;
    try {
      // Keep the public provider's initial browser bundle free of education codecs/readers.
      const [reads, { requireCompleteSnapshot }] = await Promise.all([
        import('@/lib/education/reads'), import('@poa-box/core/data/facts'),
      ]);
      if (!current()) return;
      snapshot = await reads.readEducation({ client, source, kind });
      if (!current()) return;
      requireCompleteSnapshot(snapshot, { scope: source, indexed: true, snapshot: 'pinned' });
      const data = kind === 'modules'
        ? await reads.shapeEducationModules(snapshot.data)
        : reads.shapeEducationCompletions(snapshot.data);
      if (!current()) return;
      setState({ key, loading: false, result: { ...snapshot, data }, coverage: snapshot.coverage, error: null });
      // Publish the indexed library immediately, as before. Slow content must
      // neither hide its rows nor overwrite a later read/account/org generation.
      if (kind === 'modules' && safeFetchFromIpfs && data.some(row => row.contentLoading)) {
        const hydrated = await reads.shapeEducationModules(snapshot.data, safeFetchFromIpfs);
        if (!current()) return;
        setState({ key, loading: false, result: { ...snapshot, data: hydrated }, coverage: snapshot.coverage, error: null });
      }
    } catch {
      if (!current()) return;
      setState(previous => ({ key, loading: false,
        result: previous.key === key ? previous.result : undefined,
        coverage: snapshot?.coverage ?? { status: 'unavailable', receivedKeys: [], missingIds: [], failedIds: [], issues: [{ code: 'SOURCE_FAILED' }] },
        error: 'Learning data could not finish loading. Please try again.',
      }));
    }
  }, [client, source, kind, safeFetchFromIpfs, ready, key]);

  useEffect(() => {
    const life = lifecycle.current;
    life.active = true;
    setState(previous => ({ ...(previous.key === key ? previous : {}), key, loading: ready }));
    void refetch();
    return () => { life.active = false; life.generation++; };
  }, [key, ready, refetch]);

  const wasActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActive.current) void refetch();
    wasActive.current = isActive;
    if (!isActive || !ready) return undefined;
    const timer = setInterval(() => { void refetch(); }, 60000);
    return () => clearInterval(timer);
  }, [isActive, ready, refetch]);

  return useMemo(() => {
    const visible = state.key === key ? state : { key, loading: ready };
    return {
      data: visible.result?.data ?? [], source: visible.result?.source,
      coverage: visible.coverage, loading: visible.loading,
      complete: visible.coverage?.status === 'complete' && !visible.error,
      hasKnownData: !!visible.result,
      error: visible.error ?? null,
      contentUnavailable: visible.result?.data.some(row => row.contentUnavailable) ?? false,
      refetch,
    };
  }, [state, key, ready, refetch]);
}
