import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPendingEnrollment, requirePendingEnrollment, pendingEnrollmentKey, savePendingCredential } from '@/services/web3/passkey/passkeyStorage';
const source = { chainId: 100, registryAddress: `0x${'11'.repeat(20)}`, factoryAddress: `0x${'22'.repeat(20)}` };
const credential = { orgName: 'A display name', orgId: `0x${'33'.repeat(32)}`, accountAddress: `0x${'44'.repeat(20)}`,
  credentialId: `0x${'55'.repeat(32)}`, flow: 'zkemail', username: 'member', credentialChainId: 100,
  registryAddress: source.registryAddress, factoryAddress: source.factoryAddress, targetAddress: source.registryAddress };
let records;
beforeEach(() => {
  records = new Map(); vi.stubGlobal('localStorage', { getItem: key => records.get(key) || null, setItem: (key, value) => records.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
describe('pending enrollment provenance and cross-flow barrier', () => {
  it('uses one chain/registry/factory key independent of display names or org and blocks another enrollment flow', () => {
    savePendingCredential(credential);
    expect(Object.keys(JSON.parse(records.get('poa-passkey-pending')))).toEqual([pendingEnrollmentKey(source)]);
    expect(readPendingEnrollment(source)).toMatchObject({ provenance: 'matched', credential: { orgName: 'A display name' } });
    expect(() => requirePendingEnrollment(source, { flow: 'onboarding', username: 'member' })).toThrow('earlier account setup');
    const afterReload = readPendingEnrollment({ ...source, orgId: 'different-org', orgName: 'Renamed' });
    expect(afterReload.credential.accountAddress).toBe(credential.accountAddress);
  });
  it('explicitly qualifies old display-keyed entries only from observed source fields', () => {
    records.set('poa-passkey-pending', JSON.stringify({ 'a display name': credential }));
    expect(readPendingEnrollment(source).provenance).toBe('legacy-qualified');
    savePendingCredential({ ...credential, orgName: 'New display name' });
    expect(Object.keys(JSON.parse(records.get('poa-passkey-pending')))).toEqual([pendingEnrollmentKey(source)]);
  });
  it('does not invent a chain for an unknown legacy credential or use an equal name to change its source', () => {
    const legacy = { ...credential }; delete legacy.credentialChainId;
    records.set('poa-passkey-pending', JSON.stringify({ 'a display name': legacy }));
    expect(readPendingEnrollment(source).provenance).toBe('legacy-unknown');
    expect(() => requirePendingEnrollment(source)).toThrow('earlier account setup');
    expect(readPendingEnrollment(source).credential.credentialChainId).toBeUndefined();
    records.set('poa-passkey-pending', JSON.stringify({ 'a display name': credential }));
    expect(readPendingEnrollment({ ...source, chainId: 42161 }).provenance).toBe('other-source');
    expect(() => requirePendingEnrollment({ ...source, chainId: 42161 })).toThrow('earlier account setup');
  });
  it('fails closed on unreadable storage and on another original account', () => {
    records.set('poa-passkey-pending', '{');
    expect(() => readPendingEnrollment(source)).toThrow('could not be read');
    records.clear(); savePendingCredential({ ...credential, initiator: { account: null, authType: null } });
    expect(() => requirePendingEnrollment({ ...source, initiator: { account: credential.accountAddress, authType: 'eoa' } })).toThrow('earlier account setup');
  });
});
