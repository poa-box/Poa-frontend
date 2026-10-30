import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { recoverLegacyEnrollment, restartEnrollmentWithExistingAccount } from '@/services/web3/domain/enrollmentRecovery';
import { readPendingEnrollment, readEnrollmentMigration } from '@/services/web3/passkey/passkeyStorage';
import { recoveryTestStorage } from '@/services/web3/core/submissionTestHelpers';
import { emailRecoveryFixture, legacy, TX } from '@/services/web3/domain/enrollmentRecoveryFixtures';
import { assertSourceRef } from '@poa-box/core/data/facts';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
let storage;
function setup() {
  const f = emailRecoveryFixture();
  const credential = { ...legacy, rawCredentialId: Buffer.from('1234567890', 'hex').toString('base64url') };
  storage.setItem('poa-passkey-pending', JSON.stringify({ 'old-display-name': credential }));
  const source = { chainId: 100, registryAddress: f.input.scope.contracts.registry, factoryAddress: f.input.scope.contracts.factory,
    orgId: f.input.scope.orgId, targetAddress: f.input.scope.contract, flow: 'zkemail', subgraphUrl: 'mock://index' };
  const pending = readPendingEnrollment(source);
  const query = vi.fn(async (document, vars, at) => { assertSourceRef(at); return document.includes('EnrollmentRecoveryBlock')
    ? { _meta: { block: { number: 100, hash: f.input.source.block.hash } } } : f.query(document, vars, at); });
  const input = { pending, source, publicClient: { getChainId: vi.fn(async () => 100) }, originalTransactionHash: TX,
    guard: vi.fn(), query, provider: f.provider, now: () => 1000 };
  return { ...f, input, before: storage.getItem('poa-passkey-pending') };
}
beforeEach(() => { storage = recoveryTestStorage(); vi.stubGlobal('localStorage', storage); vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); });
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('host email recovery uses the installed core verifier and separate audit storage', () => {
  it.each(['domain', 'email'])('migrates a recovered %s proof without activation or changing original bytes', async version => {
    const f = setup();
    if (version === 'email') {
      const email = emailRecoveryFixture({ version });
      f.input.provider = email.provider;
    }
    const result = await recoverLegacyEnrollment(f.input);
    expect(result.record).toMatchObject({ authorization: 'recovery-only', activationAllowed: false,
      audit: { legacyRecordId: 'old-display-name', originalTransactionHash: TX } });
    expect(result.record).not.toHaveProperty('initiator');
    expect(result.record).not.toHaveProperty('confirmation');
    expect(readEnrollmentMigration(result.record.audit.recoveryId)).toEqual(result.record);
    expect(storage.getItem('poa-passkey-pending')).toBe(f.before);
    expect((await recoverLegacyEnrollment(f.input)).alreadyMigrated).toBe(true);
    expect(storage.getItem('poa-passkey-credentials')).toBeNull();
  });
  it.each(['missing-hash', 'wrong-hash', 'foreign-source', 'stale', 'late-session', 'pending-send', 'storage-changed'])('retains %s barriers and never activates', async mode => {
    const f = setup(); let current = true;
    f.input.guard = () => { if (!current) throw new Error('stale session'); };
    if (mode === 'missing-hash') f.input.originalTransactionHash = undefined;
    if (mode === 'wrong-hash') f.input.originalTransactionHash = `0x${'77'.repeat(32)}`;
    if (mode === 'foreign-source') f.input.source.targetAddress = `0x${'99'.repeat(20)}`;
    if (mode === 'stale') f.input.now = () => 1100;
    if (mode === 'late-session') f.provider.getCode.mockImplementation(async () => { current = false; return '0x6000'; });
    if (mode === 'pending-send') storage.setItem(`poa:submission:v1:100:${legacy.accountAddress}:${ENTRY_POINT_ADDRESS.toLowerCase()}`,
      JSON.stringify({ chainId: 100, accountAddress: legacy.accountAddress, entryPoint: ENTRY_POINT_ADDRESS, kind: 'transaction', phase: 'submitting', nonce: '7' }));
    if (mode === 'storage-changed') f.provider.getCode.mockImplementation(async () => { storage.setItem('poa-passkey-pending', JSON.stringify({ changed: { ...legacy, username: 'changed' } })); return '0x6000'; });
    await expect(recoverLegacyEnrollment(f.input)).rejects.toThrow();
    if (mode !== 'storage-changed') expect(storage.getItem('poa-passkey-pending')).toBe(f.before);
    expect(storage.getItem('poa-passkey-enrollment-recovery:v1')).toBeNull();
    expect(storage.getItem('poa-passkey-credentials')).toBeNull();
  });
  it('records only an explicit independently authenticated restart and retains all legacy records', () => {
    const f = setup();
    const auth = { isAuthHydrated: true, isAuthenticated: true, accountAddress: `0x${'88'.repeat(20)}`, authType: 'eoa' };
    const result = restartEnrollmentWithExistingAccount({ ...f.input, auth });
    expect(result).toMatchObject({ action: 'claim-with-existing-account', retainLegacy: true, activationAllowed: false, createCredentialAllowed: false });
    expect(storage.getItem('poa-passkey-pending')).toBe(f.before);
    expect(storage.getItem('poa-passkey-enrollment-restarts:v1')).toContain(result.auditId);
    expect(storage.getItem('poa-passkey-credentials')).toBeNull();
  });
  it.each(['hydrating', 'anonymous', 'stale', 'unresolved-original'])('rejects %s restart', mode => {
    const f = setup(); const auth = { isAuthHydrated: true, isAuthenticated: true, accountAddress: legacy.accountAddress, authType: 'passkey' };
    if (mode === 'hydrating') auth.isAuthHydrated = false;
    if (mode === 'anonymous') auth.isAuthenticated = false;
    if (mode === 'stale') f.input.guard = () => { throw new Error('stale'); };
    if (mode === 'unresolved-original') storage.setItem(`poa:submission:v1:100:${legacy.accountAddress}:${ENTRY_POINT_ADDRESS.toLowerCase()}`,
      JSON.stringify({ chainId: 100, accountAddress: legacy.accountAddress, entryPoint: ENTRY_POINT_ADDRESS, kind: 'transaction', phase: 'submitting', nonce: '7' }));
    expect(() => restartEnrollmentWithExistingAccount({ ...f.input, auth })).toThrow();
    expect(storage.getItem('poa-passkey-pending')).toBe(f.before);
    expect(storage.getItem('poa-passkey-enrollment-restarts:v1')).toBeNull();
  });
});
