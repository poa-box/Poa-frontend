import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfig, useSwitchChain, getConnectorClient, clientToSigner } from '@/context/WalletContext';
import { useAuth } from '@/context/authState';
import { useIPFScontext } from '@/context/ipfsContext';
import { usePOContext } from '@/context/POContext';
import { useRefreshEmit, RefreshEvent } from '@/context/RefreshContext';
import { createScopeGuard, serviceScope } from '@/lib/services/runtimeScope';
import { refreshAfterIndexing } from '@/hooks/transactionNotificationLifecycle';

/** Full-form profile writes use the selected indexed registration through host managers. */
export function useProfileUpdate() {
  const auth = useAuth();
  const isSessionCurrent = auth.isSessionCurrent;
  const po = usePOContext();
  const { addToIpfs } = useIPFScontext();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const { emit } = useRefreshEmit();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('idle');
  const active = useRef(true);
  const identity = JSON.stringify([serviceScope({ ...po, ...auth }), auth.isAuthHydrated, auth.sessionGeneration]);
  const scope = useMemo(() => ({ identity }), [identity]);
  const current = useRef(scope);
  current.current = scope;
  const guard = useMemo(() => {
    const scoped = createScopeGuard(scope, () => active.current ? current.current : null);
    return () => {
      scoped();
      if (isSessionCurrent && !isSessionCurrent()) throw new Error('Your account changed. Please try again.');
    };
  }, [scope, isSessionCurrent]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setIsUpdating(false); setError(null); setStep('idle'); }, [scope]);

  const updateProfile = useCallback(async profileData => {
    guard();
    if (!auth.accountAddress || auth.isAuthHydrated === false) throw new Error('Your account is still loading. Please try again.');
    setIsUpdating(true);
    setError(null);
    const onStep = next => { guard(); setStep(next); };
    try {
      // Keep account codecs, signing and optional executors off public reading routes.
      const [{ executeProfileUpdate }, { resolveAccountWriteSource }, { createAccountHost }] = await Promise.all([
        import('@/services/web3/core/accountActions'), import('@/services/web3/core/accountWriteSource'),
        import('@/services/web3/core/accountHost'),
      ]);
      guard();
      const { result, cid, source } = await executeProfileUpdate({ profileData, guard, onStep,
        resolveSource: purpose => resolveAccountWriteSource(auth.accountAddress, { purpose, guard }),
        upload: async serialized => (await addToIpfs(serialized)).path,
        createHost: source => createAccountHost({ source, ...auth, guard,
          onStateChange: state => onStep(({ estimating: 'building', awaiting_signature: 'signing', pending: 'submitting' })[state] || state),
          ensureWallet: async chainId => {
            guard();
            await switchChainAsync({ chainId });
            guard();
            const walletClient = await getConnectorClient(wagmiConfig, { chainId });
            guard();
            return { walletClient, signer: clientToSigner(walletClient) };
          },
        }),
      });
      guard();
      setStep('success');
      void refreshAfterIndexing({ endpoint: source.endpoint, blockNumber: result.blockNumber,
        isCurrent: () => { try { guard(); return true; } catch { return false; } }, emit, event: RefreshEvent.PROFILE_UPDATED,
        data: { address: auth.accountAddress, cid, chainId: source.chainId, subgraphUrl: source.endpoint, transactionHash: result.txHash } });
      return result.txHash;
    } catch (cause) {
      try { guard(); } catch (stale) { throw stale; }
      const message = cause?.result?.error?.userMessage || (/Bio too long/.test(cause?.message || '') ? 'Keep your bio within 280 characters.' : 'Your profile could not be saved. Please check your account and try again.');
      const friendly = Object.assign(new Error(message), { result: cause?.result });
      setError(friendly);
      setStep('error');
      throw friendly;
    } finally {
      try { guard(); setIsUpdating(false); } catch { /* A new account owns the form. */ }
    }
  }, [auth, guard, addToIpfs, switchChainAsync, wagmiConfig, emit]);

  const reset = useCallback(() => { guard(); setStep('idle'); setError(null); setIsUpdating(false); }, [guard]);
  return { updateProfile, isUpdating, error, step, reset };
}
export default useProfileUpdate;
