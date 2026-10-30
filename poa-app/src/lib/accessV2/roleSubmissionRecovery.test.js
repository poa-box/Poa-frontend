import { describe, expect, it } from 'vitest';
import { utils } from 'ethers';
import { createSubmissionRecovery, transitionSubmissionRecovery } from '@poa-box/core/execute/recovery';
import { roleRecoveryIdentity } from '@/lib/accessV2/roleContinuationDraft';
import { managerIntentKey } from '@/services/web3/core/managerSubmissionScope';
import { roleContinuationScope, roleContinuationKey, readRoleContinuations, saveRoleContinuation } from '@/lib/accessV2/roleContinuationDraft';

const address = digit => `0x${digit.repeat(40)}`, hash = digit => `0x${digit.repeat(64)}`;
const scope = roleContinuationScope({ chainId: 100, orgId: hash('a'), authority: address('1'), hybridVoting: address('2'), executor: address('3'), account: address('4'), endpoint: 'https://index.invalid' });
const contract = { address: scope.hybridVoting, interface: new utils.Interface(['function createProposal(bytes title)']) };
const intentKey = managerIntentKey('execute', [contract, 'createProposal', ['0x1234']]);
function submission(kind = 'user-operation') {
  let recovery = createSubmissionRecovery({ chainId: 100, accountAddress: scope.account, intentKey, sessionKey: hash('b'), contextKey: hash('c') }, 'owner', 'attempt');
  const advance = event => { recovery = transitionSubmissionRecovery(recovery, recovery, event); };
  advance({ type: 'signing' });
  advance({ type: 'prepare', kind, nonce: '123456789012345678901234', ...(kind === 'user-operation' ? { entryPoint: address('5'), computedHash: hash('d') } : { callKey: intentKey, fromBlock: '100' }) });
  advance({ type: 'broadcast' });
  return { phase: 'submitting', chainId: 100, accountAddress: scope.account, sender: scope.account, orgId: scope.orgId,
    nonce: recovery.nonce, ...(kind === 'user-operation' ? { computedHash: hash('d'), userOpHash: hash('e'), entryPoint: address('5') } : { kind: 'transaction' }), recovery };
}
const record = saved => ({ id: 'draft', form: { name: 'Original', description: 'Keep my description', sponsorship: { enabled: false } },
  originalForm: { name: 'Original', description: 'Keep my description', sponsorship: { enabled: false } },
  creation: { status: 'uncertain', call: { target: scope.authority, value: '0', calldata: '0x1234' }, expectedIntentKey: intentKey, submission: saved },
  configuration: { status: 'uncertain', expectedIntentKey: intentKey, submission: saved, batch: [] },
  configurationHistory: [{ status: 'failed', expectedIntentKey: intentKey, submission: saved }] });

describe('durable unsigned role-stage lookup identity', () => {
  it.each(['user-operation', 'transaction'])('retains exact %s identity and strips signed payloads, credentials and provider secrets from every saved stage/history', kind => {
    const input = submission(kind);
    Object.assign(input, { signature: 'SECRET_SIGNATURE', rawSignedTransaction: 'SECRET_RAW', privateKey: 'SECRET_KEY', rpcUrl: 'https://SECRET_PROVIDER.invalid', userOperation: { signature: 'SECRET_NESTED' } });
    input.recovery.signature = 'SECRET_RECOVERY';
    const stored = new Map(), storage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
    saveRoleContinuation(storage, scope, record(input));
    expect([...stored.values()].join()).not.toContain('SECRET_');
    const [row] = readRoleContinuations(storage, scope);
    expect(row.version).toBe(3); expect(row.originalForm.description).toBe('Keep my description');
    for (const stage of [row.creation, row.configuration, ...row.configurationHistory]) {
      expect(stage.submission.recovery.attemptId).toBe('attempt'); expect(stage.submission.nonce).toBe(input.nonce);
      if (kind === 'user-operation') {
        expect(stage.submission.computedHash).toBe(hash('d')); expect(stage.submission.userOpHash).toBe(hash('e'));
        // A differing bundler acknowledgement never replaces the computed identity.
        expect(stage.submission.recovery.computedHash).toBe(hash('d'));
      }
    }
  });
  it.each([1, 2])('loads the original version-%s continuation key and keeps create-only and failed configuration history', version => {
    const row = { ...record(submission()), version, scope, requiresConfiguration: false,
      configuration: { status: 'failed', failureKind: 'execution', batch: [] } };
    const stored = new Map([[roleContinuationKey(scope), JSON.stringify([row])]]);
    const storage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
    const [loaded] = readRoleContinuations(storage, scope);
    expect(loaded.originalForm).toEqual(row.originalForm); expect(loaded.requiresConfiguration).toBe(false);
    expect(loaded.configuration).toMatchObject({ status: 'failed', failureKind: 'execution' });
    expect(loaded.configurationHistory).toHaveLength(1);
    const updated = saveRoleContinuation(storage, scope, loaded);
    expect(updated.version).toBe(3); expect(updated.creation.submission.recovery).toEqual(loaded.creation.submission.recovery);
    expect(stored.size).toBe(1);
  });
  it.each(['chain', 'account', 'intent', 'organization', 'nonce', 'hash', 'entryPoint'])('rejects mismatched %s and retains the draft locked rather than silently dropping it', mismatch => {
    const input = submission();
    if (mismatch === 'chain') input.chainId = 42161;
    if (mismatch === 'account') input.accountAddress = address('9');
    if (mismatch === 'intent') input.recovery.scope.intentKey = hash('9');
    if (mismatch === 'organization') input.orgId = hash('9');
    if (mismatch === 'nonce') input.nonce = '9';
    if (mismatch === 'hash') input.computedHash = hash('9');
    if (mismatch === 'entryPoint') input.entryPoint = address('9');
    expect(() => roleRecoveryIdentity(input, scope, intentKey)).toThrow();
    const stored = new Map(), storage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
    saveRoleContinuation(storage, scope, record(input));
    expect(readRoleContinuations(storage, scope)[0].creation).toMatchObject({ status: 'uncertain', recoveryInvalid: true });
    expect(readRoleContinuations(storage, scope)).toHaveLength(1);
  });
});
