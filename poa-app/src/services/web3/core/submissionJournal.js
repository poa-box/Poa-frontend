import { requireRawUint } from '@poa-box/core/amounts';
import { SponsoredSubmissionError } from '@poa-box/core/sponsorship-config';
import { createSubmissionRecovery, normalizeSubmissionRecovery, transitionSubmissionRecovery, canAbandonSubmissionRecovery, assertSubmissionFence } from '@poa-box/core/execute/recovery';
import { keccak256 } from '@ethersproject/keccak256';
import { toUtf8Bytes } from '@ethersproject/strings';
import { createBrowserSubmissionLock } from '@/services/web3/core/browserSubmissionLock';

const PREFIX = 'poa:submission:v1:'; // Preserve every existing uncertain submission.
const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const hash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value);
const digest = value => keccak256(toUtf8Bytes(JSON.stringify(value)));
const newId = () => globalThis.crypto.randomUUID();
const documentSession = newId();
const identity = value => value.recovery?.attemptId || (value.kind === 'transaction' ? value.nonce : value.computedHash?.toLowerCase());

/** Same-account signing excludes all intents, sessions and EntryPoints on this chain. */
export const submissionLockName = (chainId, account) => `poa:signing:v2:${chainId}:${account.toLowerCase()}`;

/** Browser persistence contains allowlisted recovery identity only, never operations/signatures/URLs. */
export function createSubmissionJournal({ accountAddress, chainId, entryPoint, context = {}, storage, locks } = {}) {
  const key = `${PREFIX}${chainId}:${accountAddress?.toLowerCase()}:${entryPoint?.toLowerCase()}`;
  const store = () => storage || (typeof window === 'undefined' ? null : window.localStorage);
  const lock = createBrowserSubmissionLock(submissionLockName(chainId, accountAddress || ''), locks);
  let memory = null;
  let lease = null;
  let ownerId = null;
  const clean = submission => {
    const native = submission.kind === 'transaction';
    const recovery = submission.recovery && normalizeSubmissionRecovery(submission.recovery);
    const preSend = recovery && canAbandonSubmissionRecovery(recovery);
    if (!address(accountAddress) || !address(entryPoint) || !Number.isSafeInteger(chainId) || chainId <= 0
      || submission.chainId !== chainId || (!native && !preSend && submission.entryPoint?.toLowerCase() !== entryPoint.toLowerCase())
      || (!native && !preSend && !hash(submission.computedHash))
      || !['intent', 'signing', 'prepared', 'submitting', 'submitted', 'receipt'].includes(submission.phase)) {
      throw new Error('Saved transaction status is unavailable. Check this account before trying again.');
    }
    if (native && !preSend) requireRawUint(submission.nonce);
    if (recovery && ((recovery.kind && recovery.kind !== (native ? 'transaction' : 'user-operation')) || recovery.scope.chainId !== chainId || recovery.scope.accountAddress !== accountAddress.toLowerCase()
      || (recovery.entryPoint && recovery.entryPoint !== entryPoint.toLowerCase())
      || (recovery.nonce !== undefined && recovery.nonce !== requireRawUint(submission.nonce))
      || (recovery.computedHash && recovery.computedHash !== submission.computedHash?.toLowerCase())
      || (recovery.txHash && recovery.txHash !== submission.txHash?.toLowerCase()))) throw new Error('Saved transaction scope does not match.');
    if (!native && submission.sender !== undefined && (!address(submission.sender) || submission.sender.toLowerCase() !== accountAddress.toLowerCase())) throw new Error('Saved transaction account does not match.');
    return {
      phase: submission.phase, chainId, entryPoint,
      ...(native ? { kind: 'transaction', ...(submission.nonce === undefined ? {} : { nonce: requireRawUint(submission.nonce) }) } : {
        ...(hash(submission.computedHash) ? { computedHash: submission.computedHash } : {}),
        ...(submission.sender === undefined ? {} : { sender: submission.sender.toLowerCase() }),
        ...(submission.nonce === undefined ? {} : { nonce: requireRawUint(submission.nonce) }),
      }),
      accountAddress: accountAddress.toLowerCase(),
      ...(hash(submission.userOpHash) ? { userOpHash: submission.userOpHash } : {}),
      ...(hash(submission.txHash) ? { txHash: submission.txHash } : {}),
      ...(hash(submission.orgId || context.orgId) ? { orgId: submission.orgId || context.orgId } : {}),
      ...(hash(submission.scopeKey || context.scopeKey) ? { scopeKey: submission.scopeKey || context.scopeKey } : {}),
      ...(Number.isSafeInteger(submission.generation ?? context.generation) ? { generation: submission.generation ?? context.generation } : {}),
      ...(['eoa', 'passkey'].includes(submission.authType || context.authType) ? { authType: submission.authType || context.authType } : {}),
      ...(recovery ? { recovery } : {}),
    };
  };
  const emit = () => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('poa:submission'));
  };
  const persist = submission => {
    const record = clean(submission);
    const target = store();
    if (typeof window !== 'undefined' && !target) throw new Error('Saved transaction status is unavailable.');
    target?.setItem(key, JSON.stringify(record));
    memory = record;
    emit();
    return record;
  };
  const assertLease = () => { if (!lease) throw new Error('No active signing session.'); lease.assert(); };
  const advance = (previous, event) => {
    assertLease();
    if (previous.recovery.ownerId !== ownerId) throw new Error('Stale signing session.');
    return transitionSubmissionRecovery(previous.recovery, previous.recovery, event);
  };
  const journal = {
    read() {
      const raw = store()?.getItem(key);
      if (!raw) return store() ? null : memory;
      const parsed = JSON.parse(raw);
      if (parsed.accountAddress !== accountAddress.toLowerCase()) throw new Error('Saved transaction account does not match.');
      return clean(parsed);
    },
    readPendingAccount() {
      return listPendingSubmissions(accountAddress, store()).find(record => record.chainId === chainId) || this.read();
    },
    hasLease() { try { assertLease(); return true; } catch { return false; } },
    assertLease,
    async acquire() {
      if (lease) throw new Error('Another action is already in progress for this account.');
      const acquired = await lock.acquire();
      lease = acquired;
      ownerId = newId();
      return () => { if (lease === acquired) { lease = null; ownerId = null; } return acquired(); };
    },
    /** Only exclusive-lock acquisition proves a crashed pre-broadcast owner cannot resume. */
    abandonUnsent() {
      assertLease();
      const previous = this.read();
      if (previous?.recovery && canAbandonSubmissionRecovery(previous.recovery)) {
        store()?.removeItem(key); memory = null; emit();
      }
    },
    begin(intentKey) {
      assertLease();
      if (this.read()) throw new Error('Check the earlier transaction before trying again.');
      const recovery = createSubmissionRecovery({ chainId, accountAddress, intentKey,
        sessionKey: digest([documentSession, context.generation ?? null, context.authType ?? null]),
        contextKey: digest([context.scopeKey ?? null, context.orgId ?? null, context.authType ?? null]),
      }, ownerId, newId());
      return persist({ phase: 'intent', chainId, entryPoint, recovery });
    },
    signing() {
      const previous = this.read();
      if (previous?.recovery?.phase === 'intent') persist({ ...previous, phase: 'signing', recovery: advance(previous, { type: 'signing' }) });
    },
    prepare(submission) {
      const previous = this.read();
      if (!previous?.recovery) throw new Error('Missing submission intent.');
      const native = submission.kind === 'transaction';
      const event = { type: 'prepare', kind: native ? 'transaction' : 'user-operation', nonce: requireRawUint(submission.nonce),
        ...(native ? { callKey: submission.callKey, ...(submission.fromBlock === undefined ? {} : { fromBlock: requireRawUint(submission.fromBlock) }) }
          : { entryPoint, computedHash: submission.computedHash }) };
      return persist({ ...previous, ...submission, phase: 'prepared', recovery: advance(previous, event) });
    },
    write(submission) {
      assertLease();
      let previous = this.read();
      if (!previous?.recovery) {
        // Legacy descriptors may be updated only while holding the atomic account lease.
        if (previous && identity(previous) !== identity(submission)) throw new Error('Check the earlier transaction before trying again.');
        return persist(submission);
      }
      if (previous.recovery.ownerId !== ownerId) throw new Error('Stale signing session.');
      if (['intent', 'signing'].includes(previous.recovery.phase)) previous = this.prepare(submission);
      const native = submission.kind === 'transaction';
      if (previous.recovery.kind !== (native ? 'transaction' : 'user-operation')
        || previous.recovery.nonce !== requireRawUint(submission.nonce)
        || (!native && previous.recovery.computedHash !== submission.computedHash?.toLowerCase())) throw new Error('Submission identity changed.');
      let recovery = previous.recovery;
      if (submission.phase === 'submitting' && recovery.phase === 'prepared') recovery = advance(previous, { type: 'broadcast' });
      else if (submission.phase === 'submitted' && recovery.phase === 'submitting') recovery = advance(previous, { type: 'acknowledge', ...(native ? { txHash: submission.txHash } : {}) });
      else throw new Error('Invalid submission transition.');
      return persist({ ...previous, ...submission, recovery });
    },
    clear(submission) {
      // Recovery UI uses a separate journal; serialize its compare-and-remove too.
      if (!this.hasLease()) return this.acquire().then(async release => { try { return this.clear(submission); } finally { await release(); } }).catch(() => false);
      try {
        assertLease();
        const previous = this.read();
        const expected = clean(submission);
        if (!previous || Boolean(previous.recovery) !== Boolean(expected.recovery)) return false;
        if (previous.recovery) assertSubmissionFence(previous.recovery, expected.recovery);
        else if (JSON.stringify(previous) !== JSON.stringify(expected)) return false;
        const target = store();
        target?.removeItem(key);
        if (target?.getItem(key) != null) return false;
        memory = null;
        emit();
        return true;
      } catch { return false; }
    },
  };
  return journal;
}

export function pendingSubmissionError(submission) {
  if (submission.kind === 'transaction') return Object.assign(new Error('Check the earlier transaction before trying again.'), { nativeSubmission: submission });
  return new SponsoredSubmissionError('Check the earlier transaction before trying again.', submission);
}

/** Enumerate only this app's safe identities for the current account, across target chains. */
export function listPendingSubmissions(accountAddress, storage) {
  if (!address(accountAddress)) return [];
  const target = storage || (typeof window === 'undefined' ? null : window.localStorage);
  const result = [];
  for (let index = 0; target && index < target.length; index += 1) {
    const key = target.key(index);
    if (!key?.startsWith(PREFIX)) continue;
    const [chain, account, entryPoint] = key.slice(PREFIX.length).split(':');
    if (account !== accountAddress.toLowerCase()) continue;
    const record = createSubmissionJournal({ accountAddress, chainId: Number(chain), entryPoint, storage: target }).read();
    if (record) result.push(record);
  }
  return result;
}
