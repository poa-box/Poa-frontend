import React, { useEffect, useRef, useState } from 'react';
import { canAbandonSubmissionRecovery } from '@poa-box/core/execute/recovery';
import { listPendingSubmissions, createSubmissionJournal } from '@/services/web3/core/submissionJournal';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { createSubmissionController } from '@/services/web3/core/managerLifecycle';

/** Account status is read-only. Exclusive compare-and-clear owns every removal. */
export default function SubmissionRecovery({ manager, guard, accountAddress }) {
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [candidate, setCandidate] = useState('');
  const request = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const read = () => {
      try { guard(); setPending(listPendingSubmissions(accountAddress)[0] || manager.getPendingSubmission?.() || null); }
      catch { setMessage('Saved transaction status is unavailable. Please check your account before trying again.'); }
    };
    const invalidate = () => { request.current++; };
    invalidate(); busy.current = false;
    setMessage(''); setChecking(false); setCandidate(''); read();
    window.addEventListener('poa:submission', read);
    window.addEventListener('storage', read);
    return () => { invalidate(); window.removeEventListener('poa:submission', read); window.removeEventListener('storage', read); };
  }, [manager, guard, accountAddress]);
  const check = async () => {
    if (busy.current || !pending) return;
    const saved = pending;
    const id = ++request.current;
    const current = () => { guard(); if (request.current !== id) throw new Error('Stale status request'); };
    const journal = createSubmissionJournal({ accountAddress, chainId: saved.chainId, entryPoint: saved.entryPoint || ENTRY_POINT_ADDRESS });
    try {
      current(); busy.current = true; setChecking(true);
      const controller = createSubmissionController({ journal, accountAddress, chainId: saved.chainId, scopeGuard: current,
        clients: async () => {
          const { createChainClients } = await import('@/services/web3/utils/chainClients');
          current();
          const clients = createChainClients(saved.chainId);
          if (!clients || await clients.publicClient.getChainId() !== saved.chainId) throw new Error('Network unavailable');
          return clients;
        },
      });
      const { outcome: { status } } = await controller.recover(saved, { candidateTxHash: candidate || undefined });
      current();
      setPending(listPendingSubmissions(accountAddress)[0] || null);
      setMessage(status === 'unknown' ? 'This transaction is still unconfirmed. Please check again later.'
        : status === 'succeeded' ? 'Transaction confirmed. Refresh the page to see your update.'
          : status === 'replaced' ? 'A different action used this transaction’s place. The original action was not confirmed. Review your account before continuing.'
            : status === 'aborted' ? 'The unsent action was cancelled. You can start again.'
              : 'This transaction did not complete. You can try the action again.');
    } catch {
      try { current(); setPending(listPendingSubmissions(accountAddress)[0] || null); setMessage('We couldn’t check or update this saved transaction. Another tab may be using it. Check again later.'); } catch { /* New scope owns UI. */ }
    } finally {
      try { current(); busy.current = false; setChecking(false); } catch { /* New scope owns UI. */ }
    }
  };
  if (!pending && !message) return null;
  const unsent = pending?.recovery && canAbandonSubmissionRecovery(pending.recovery);
  return <div role="status" style={{ padding: '12px', textAlign: 'center' }}>
    <span>{message || 'An earlier transaction is still unconfirmed. Check its status before trying again.'}</span>{' '}
    {pending && <button type="button" disabled={checking} onClick={check}>{checking ? 'Checking...' : unsent ? 'Cancel unsent action' : 'Check status'}</button>}
    {pending?.kind === 'transaction' && pending.recovery && !unsent && <label>
      Original transaction reference (optional)
      <input aria-label="Original transaction reference" value={candidate} disabled={checking} onChange={event => setCandidate(event.target.value.trim())} />
    </label>}
  </div>;
}
