import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { createScopeGuard, serviceScope } from '@/lib/services/runtimeScope';
import { createRuntimeLoader } from '@/lib/services/runtimeLoader';
import { selectRuntimeSnapshot } from '@/lib/services/runtimeReadiness';
import { shouldLoadServiceRuntime } from '@/lib/services/runtimeDemand';

const Web3ServicesContext = createContext(null);
const loadRuntime = createRuntimeLoader(() => import('@/components/providers/Web3ServicesRuntime'));

class RuntimeErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * Stable shell: readers and optimistic state stay mounted while the service
 * implementation loads. One owner mounts below public Auth/IPFS/PO/User.
 * Its runtime host lives in the sibling wallet island under real Wagmi providers.
 */
export function Web3ServicesProvider({ children }) {
  const auth = useAuth();
  const po = usePOContext();
  const scope = serviceScope({ ...po, ...auth });
  const [subscribers, setSubscribers] = useState(0);
  const [explicitRequest, setExplicitRequest] = useState(false);
  const requested = shouldLoadServiceRuntime(subscribers, auth, explicitRequest);
  // A suspended runtime must publish afresh when demand returns, even for the
  // same account/org. Do not revive an earlier signer's cached snapshot.
  const runtimeScope = useMemo(() => ({ identity: scope, requested }), [scope, requested]);
  const scopeRef = useRef(runtimeScope);
  // Mask stale snapshots and captured callbacks during render, before effects.
  scopeRef.current = requested ? runtimeScope : null;
  const activeRef = useRef(true);
  const guard = useMemo(() => createScopeGuard(runtimeScope, () => activeRef.current ? scopeRef.current : null), [runtimeScope]);
  const [Runtime, setRuntime] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [runtimeError, setRuntimeError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  const requestRuntime = useCallback(() => {
    setSubscribers((count) => count + 1);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      setSubscribers((count) => count - 1);
    };
  }, []);
  const retryRuntime = useCallback(() => {
    setRuntimeError(null);
    setSnapshot(null);
    setAttempt((value) => value + 1);
    setExplicitRequest(true);
  }, []);

  useEffect(() => {
    if (!requested) {
      setRuntimeError(null);
      return;
    }
    let cancelled = false;
    loadRuntime().then((module) => {
      if (!cancelled) setRuntime(() => module.default);
    }).catch((error) => {
      if (!cancelled) setRuntimeError(error);
    });
    return () => { cancelled = true; };
  }, [requested, attempt]);

  const publish = useCallback((next) => setSnapshot(next), []);
  const current = requested ? selectRuntimeSnapshot(snapshot, runtimeScope, runtimeError) : null;
  const value = useMemo(() => ({
    services: current,
    requestRuntime,
    retryRuntime,
    runtimeError,
    host: { Runtime, requested, attempt, runtimeScope, guard, publish, setRuntimeError },
  }), [current, requestRuntime, retryRuntime, runtimeError, Runtime, requested, attempt, runtimeScope, guard, publish]);

  return (
    <Web3ServicesContext.Provider value={value}>
      {children}
      {requested && runtimeError && (
        <div role="alert">
          Account actions could not finish loading.{' '}
          <button type="button" onClick={retryRuntime}>Try again</button>
        </div>
      )}
    </Web3ServicesContext.Provider>
  );
}

export function useWeb3ServicesContext() {
  const context = useContext(Web3ServicesContext);
  if (!context) throw new Error('useWeb3Services must be used within a Web3ServicesProvider');
  return context;
}

/** Mount only inside Core's Wagmi/Auth island, beneath the public service owner. */
export function Web3ServicesRuntimeHost() {
  const { host } = useWeb3ServicesContext();
  const { Runtime, requested, attempt, runtimeScope, guard, publish, setRuntimeError } = host;
  if (!Runtime || !requested) return null;
  return (
    <RuntimeErrorBoundary key={attempt} onError={setRuntimeError}>
      <Runtime scope={runtimeScope} guard={guard} publish={publish} />
    </RuntimeErrorBoundary>
  );
}
