import { useCallback, useEffect, useRef, useState } from 'react';
import { createScopedRequestGate } from '@/lib/services/scopedRequestGate';
import { findUserProfileByUsername, findUserOrgsAcrossChains } from '@/util/crossChainUsername';

// Incomplete responses can add known cards, but cannot prove earlier cards absent.
export function mergeProfileOrganizations(previous, incoming) {
  if (incoming.isComplete === true) return incoming;
  const cards = new Map(previous.map(card => [`${card.sourceChainId}:${card.id}`, card]));
  for (const card of incoming) cards.set(`${card.sourceChainId}:${card.id}`, card);
  return Object.assign([...cards.values()], { isComplete: false });
}

function usePublicReadScope(scope) {
  const gate = useRef(null);
  if (!gate.current) gate.current = createScopedRequestGate();
  gate.current.setScope(scope);
  useEffect(() => {
    gate.current.setScope(scope);
    return () => gate.current.setScope(Symbol('unmounted'));
  }, [scope]);
  return gate.current;
}

export function useProfileMemberships(address, enabled = true) {
  const scope = enabled && address ? address.toLowerCase() : '';
  const gate = usePublicReadScope(scope);
  const [state, setState] = useState(null);
  const refetch = useCallback(async () => {
    const current = gate.start(scope);
    if (!current || !scope) return;
    setState(previous => current() ? { ...(previous?.scope === scope ? previous : {}), scope, loading: true } : previous);
    try {
      const incoming = await findUserOrgsAcrossChains(scope);
      if (current()) setState(previous => current() ? { scope, loading: false,
        organizations: mergeProfileOrganizations(previous?.scope === scope ? previous.organizations || [] : [], incoming),
        unavailable: incoming.isComplete !== true } : previous);
    } catch {
      if (current()) setState(previous => current() ? { scope, loading: false, unavailable: true,
        organizations: previous?.scope === scope ? previous.organizations || [] : [] } : previous);
    }
  }, [gate, scope]);
  useEffect(() => { refetch(); }, [refetch]);
  const current = scope && state?.scope === scope ? state : null;
  return { organizations: current?.organizations || [], isLoading: !!scope && (!current || current.loading),
    isComplete: !!current && !current.loading && !current.unavailable && current.organizations?.isComplete === true,
    isUnavailable: !!current?.unavailable, refetch };
}

export function usePublicProfile(username, ready) {
  const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const scope = ready ? name : null;
  const gate = usePublicReadScope(scope);
  const [state, setState] = useState(null);
  const refetch = useCallback(async () => {
    const current = gate.start(scope);
    if (!current || scope === null) return;
    if (!scope) { setState({ scope, notFound: true, loading: false }); return; }
    setState(previous => current() ? { ...(previous?.scope === scope ? previous : {}), scope, loading: true } : previous);
    try {
      const profile = await findUserProfileByUsername(scope);
      if (!current()) return;
      setState(previous => {
        if (!current()) return previous;
        const saved = previous?.scope === scope ? previous.profile : null;
        let known = profile.address ? profile : profile.isComplete === true ? null : saved;
        if (known && saved?.address === known.address && profile.isComplete !== true) {
          known = { ...saved, ...known, username: known.username || saved.username,
            metadata: { ...saved.metadata, ...Object.fromEntries(Object.entries(known.metadata || {}).filter(([, value]) => value != null && value !== '')) } };
        }
        return { scope, profile: known, loading: false, unavailable: profile.isComplete !== true,
          notFound: !known && profile.isComplete === true };
      });
    } catch {
      if (current()) setState(previous => current() ? { scope, loading: false, unavailable: true,
        profile: previous?.scope === scope ? previous.profile : null } : previous);
    }
  }, [gate, scope]);
  useEffect(() => { refetch(); }, [refetch]);
  const current = state?.scope === scope ? state : null;
  return { profile: current?.profile || null, isLoading: !ready || !current || current.loading,
    isUnavailable: !!current?.unavailable, notFound: current?.notFound === true, refetch };
}

export const knownNativeBalance = (balances, chainId) => {
  const value = balances?.[chainId];
  return typeof value === 'string' && /^\d+$/.test(value) ? value : null;
};

export function usePreservedProfileMetadata(account, metadata, unavailable) {
  const saved = useRef(null);
  const scope = account?.toLowerCase();
  if (!saved.current || saved.current.scope !== scope) saved.current = { scope, metadata: null };
  const next = unavailable ? { ...saved.current.metadata,
    ...Object.fromEntries(Object.entries(metadata || {}).filter(([, value]) => value != null && value !== '')) } : metadata;
  const previous = saved.current.metadata;
  // ProfileEditor initializes its draft when this reference changes. An outage
  // or unrelated balance update must not reset an unchanged profile form.
  if (!previous || !next || Object.keys(previous).length !== Object.keys(next).length
    || Object.keys(next).some(key => previous[key] !== next[key])) saved.current.metadata = next;
  return saved.current.metadata;
}
