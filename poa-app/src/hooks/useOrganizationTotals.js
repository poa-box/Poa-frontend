import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { organizationTotalsKey } from '@/lib/graphql/organizationTotalsScope';

/** Frontend lifecycle only: no old-org totals during navigation or late reads. */
export function useOrganizationTotals({ chainId, endpoint, orgId, authority, token, hub, enabled = true }) {
  const source = useMemo(() => ({ chainId, endpoint, orgId, indexed: true, snapshot: 'latest', method: 'graph:organization-totals' }), [chainId, endpoint, orgId]);
  const options = useMemo(() => ({ source, authority, token, hub }), [source, authority, token, hub]);
  const ready = !!(enabled && chainId && endpoint && orgId && authority);
  const key = JSON.stringify([ready, organizationTotalsKey(options)]);
  const currentKey = useRef(key); currentKey.current = key;
  const lifecycle = useRef({ generation: 0, active: false });
  const [state, setState] = useState({ key, loading: ready });
  const refetch = useCallback(async (force = true) => {
    const life = lifecycle.current;
    if (!ready || !life.active || currentKey.current !== key) return;
    const generation = ++life.generation;
    const current = () => life.active && life.generation === generation && currentKey.current === key;
    setState(previous => ({ ...(previous.key === key ? previous : {}), key, loading: true }));
    try {
      const { readOrganizationTotals } = await import('@/util/organizationTotals');
      if (!current()) return;
      const result = await readOrganizationTotals({ ...options, force });
      if (current()) setState({ key, loading: false, result });
    } catch {
      // Previously proven totals may be retained as evidence, never current totals.
      if (current()) setState({ key, loading: false, error: 'Organization totals are unavailable. Please try again.' });
    }
  }, [key, ready, options]);
  useEffect(() => {
    const life = lifecycle.current; life.active = true;
    void refetch(false);
    return () => { life.active = false; life.generation++; };
  }, [refetch]);
  return useMemo(() => {
    const visible = state.key === key ? state : { loading: ready };
    return { ...visible.result, loading: visible.loading, error: visible.error, refetch };
  }, [state, key, ready, refetch]);
}
