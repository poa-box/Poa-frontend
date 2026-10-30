import { describe, expect, it, vi } from 'vitest';
import { MembershipAuthorityService } from './MembershipAuthorityService';

const AUTHORITY = '0x1111111111111111111111111111111111111111';
const USER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('MembershipAuthorityService cross-chain reads', () => {
  it('uses the dedicated org-chain read factory for canRemove', async () => {
    const canRemove = vi.fn(async () => ({ reason: 0, sourceSet: 0 }));
    const writeFactory = {
      createReadOnly: vi.fn(() => { throw new Error('home-chain factory used for read'); }),
    };
    const readFactory = {
      createReadOnly: vi.fn(() => ({ canRemove })),
    };
    const service = new MembershipAuthorityService(writeFactory, null, readFactory);

    await expect(service.canRemove(AUTHORITY, '7', USER, true)).resolves.toEqual({
      reason: 0,
      sourceSet: 0,
    });
    expect(readFactory.createReadOnly).toHaveBeenCalledWith(AUTHORITY, expect.any(Array));
    expect(writeFactory.createReadOnly).not.toHaveBeenCalled();
    expect(canRemove).toHaveBeenCalledWith('7', USER, true);
  });

  it('keeps the original factory as the backwards-compatible default', async () => {
    const factory = {
      createReadOnly: vi.fn(() => ({
        canRemove: async () => ({ reason: 7, sourceSet: 5 }),
      })),
    };
    const service = new MembershipAuthorityService(factory, null);
    await expect(service.canRemove(AUTHORITY, '8', USER, false)).resolves.toEqual({
      reason: 7,
      sourceSet: 5,
    });
    expect(factory.createReadOnly).toHaveBeenCalledOnce();
  });
});

const BLOCK_HASH = `0x${'ab'.repeat(32)}`;
const OBSERVATION = { chainId: 100, orgId: `0x${'55'.repeat(32)}`, contract: AUTHORITY, account: USER,
  endpoint: 'https://index.invalid', indexed: true, method: 'authority-snapshot', snapshot: 'pinned', block: { number: '123', hash: BLOCK_HASH } };
const CONFIG = { quorum: '1', voucherSubjectId: '9', epoch: '2' };
function vouchReader() {
  const provider = { connection: { url: 'https://rpc.invalid' }, getNetwork: vi.fn(async () => ({ chainId: 100 })),
    getBlock: vi.fn(async () => ({ number: 123, hash: BLOCK_HASH })) };
  const contract = { provider, vouchConfig: vi.fn(async () => ({ quorum: '1', voucherSubject: '9', epoch: '2' })), vouchCount: vi.fn(async () => 0) };
  const writeFactory = { createReadOnly: vi.fn(() => { throw new Error('Home chain read'); }) };
  const readFactory = { createReadOnly: vi.fn(() => contract) };
  const service = new MembershipAuthorityService(writeFactory, null, readFactory);
  return { provider, contract, readFactory, writeFactory, read: (options = {}) => service.readEffectiveVouchCount(AUTHORITY, '7', USER, { source: OBSERVATION, config: CONFIG, ...options }) };
}
describe('scoped effective newcomer vouch count', () => {
 it('observes the effective zero counter and matching config at the verified indexed block on the org provider', async () => {
  const h = vouchReader(); const count = await h.read();
  expect(count).toEqual({ state: 'known', value: '0', source: { ...OBSERVATION, indexed: false, method: 'vouchCount', endpoint: 'https://rpc.invalid' } });
  expect(h.contract.vouchCount).toHaveBeenCalledWith('7', USER, { blockTag: 123 });
  expect(h.contract.vouchConfig).toHaveBeenCalledWith('7', { blockTag: 123 });
  expect(h.provider.getBlock).toHaveBeenCalledTimes(2); expect(h.provider.getNetwork).toHaveBeenCalledTimes(2);
  expect(h.writeFactory.createReadOnly).not.toHaveBeenCalled();
 });
 it.each(['quorum','voucherSubject','epoch'])('refuses a mismatched observed %s', async field => {
  const h = vouchReader(); h.contract.vouchConfig.mockResolvedValue({ quorum: '1', voucherSubject: '9', epoch: '2', [field]: '3' });
  await expect(h.read()).rejects.toThrow('configuration does not match');
 });
 it.each(['contract','account','block'])('refuses missing or mismatched %s source before any contract read', async field => {
  const h = vouchReader(); const source = { ...OBSERVATION, [field]: field === 'block' ? { number: '123' } : `0x${'66'.repeat(20)}` };
  await expect(h.read({ source })).rejects.toThrow('scope is unavailable'); expect(h.readFactory.createReadOnly).not.toHaveBeenCalled();
 });
 it('rejects a zero target before consulting a provider', async () => {
  const factory = { createReadOnly: vi.fn() }; const service = new MembershipAuthorityService(factory, null);
  await expect(service.readEffectiveVouchCount(AUTHORITY, '7', `0x${'0'.repeat(40)}`, { source: OBSERVATION, config: CONFIG })).rejects.toThrow('nonzero user address');
  expect(factory.createReadOnly).not.toHaveBeenCalled();
 });
 it('rejects a wrong provider chain before reading counters', async () => {
  const h = vouchReader(); h.provider.getNetwork.mockResolvedValue({ chainId: 42161 });
  await expect(h.read()).rejects.toThrow('network changed'); expect(h.contract.vouchCount).not.toHaveBeenCalled();
 });
 it('rejects a reorg between the before and after read anchors', async () => {
  const h = vouchReader(); h.provider.getBlock.mockResolvedValueOnce({ number: 123, hash: BLOCK_HASH }).mockResolvedValue({ number: 123, hash: `0x${'cd'.repeat(32)}` });
  await expect(h.read()).rejects.toThrow();
 });
 it('propagates an unavailable historical counter instead of assuming zero', async () => {
  const h = vouchReader(); h.contract.vouchCount.mockRejectedValue(new Error('Historical read unavailable'));
  await expect(h.read()).rejects.toThrow('Historical read unavailable');
 });
 it('rejects an invalid or overflowing counter', async () => {
  const h = vouchReader(); h.contract.vouchCount.mockResolvedValue('4294967296'); await expect(h.read()).rejects.toThrow();
 });
});
