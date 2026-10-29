import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import EducationHubABI from '../../../../abi/EducationHubNew.json';
import { EducationService } from '@/services/web3/domain/EducationService';

const HUB = `0x${'12'.repeat(20)}`;
const OTHER = `0x${'34'.repeat(20)}`;
const ID = '9007199254740993';
const HASH = `0x${'ab'.repeat(32)}`;
const CID = 'QmZtnFaddFtzGNT8BxdHVbQrhSFdq1pWxud5z4fA4kxfDt';
const iface = new ethers.utils.Interface(EducationHubABI);
const utf8 = ethers.utils.toUtf8Bytes;

function host(storage = true) {
  const result = { success: true, receipt: { status: 1 }, customHostData: 'retained' };
  const factory = { createWritable: vi.fn((address, abi) => ({ address, abi })) };
  const manager = { execute: vi.fn().mockResolvedValue(result) };
  const ipfs = storage ? { addToIpfs: vi.fn().mockResolvedValue({ path: CID }) } : null;
  return { service: new EducationService(factory, manager, ipfs), factory, manager, ipfs, result };
}
function data(extra = {}) {
  return { name: 'Learning together 🌱', description: 'Shared possibilities', link: 'https://example.test/lesson',
    quiz: ['How?'], answers: [['With care', 'Together']], correctAnswers: [1], payout: '0.125', ...extra };
}
function callData(host) {
  const [contract, method, args] = host.manager.execute.mock.calls.at(-1);
  return new ethers.utils.Interface(contract.abi).encodeFunctionData(method, args);
}

describe('EducationService core migration', () => {
  it.each(['0.125', '1.000000000000000001', '9007199254740993'])('preserves exact reward %s and private correct answer', async payout => {
    const h = host();
    const options = { scopeGuard: vi.fn(), onSuccess: vi.fn(), confirmations: 2 };
    const input = data({ payout });
    await expect(h.service.createModule(HUB, input, options)).resolves.toBe(h.result);
    expect(callData(h)).toBe(iface.encodeFunctionData('createModule', [utf8(input.name), HASH,
      ethers.utils.parseUnits(payout, 18), 1]));
    expect(h.ipfs.addToIpfs.mock.calls[0][0]).toBe(JSON.stringify({ name: input.name,
      description: input.description, link: input.link, quiz: input.quiz, answers: input.answers }));
    expect(h.ipfs.addToIpfs.mock.calls[0][0]).not.toContain('correctAnswers');
    expect(h.manager.execute.mock.calls[0][3]).toEqual({ ...options, value: '0' });
  });

  it('retains optional storage and default metadata fields', async () => {
    const h = host(false);
    await h.service.createModule(HUB, { name: 'Lesson', payout: '1', correctAnswers: [0] });
    expect(callData(h)).toBe(iface.encodeFunctionData('createModule', [utf8('Lesson'), ethers.constants.HashZero,
      ethers.utils.parseUnits('1', 18), 0]));
  });

  it.each([0, 255])('completes one answer %s using exact composite module ID', async answer => {
    const h = host();
    const options = { onPending: vi.fn(), scopeGuard: vi.fn() };
    await expect(h.service.completeModule(HUB, `${HUB}-${ID}`, [answer, 42], options)).resolves.toBe(h.result);
    expect(callData(h)).toBe(iface.encodeFunctionData('completeModule', [ID, answer]));
    expect(h.manager.execute.mock.calls[0][3]).toEqual({ ...options, value: '0' });
    expect(h.ipfs.addToIpfs).not.toHaveBeenCalled();
  });

  it('updates a prepared module with raw wei and immutable answer identity', async () => {
    const h = host();
    const raw = '9007199254740993123456789012345678';
    await h.service.updateModule(HUB, `${HUB}-${ID}`, {
      name: 'Updated lesson', contentHash: CID, payoutWei: ethers.BigNumber.from(raw),
      correctAnswers: [2],
    });
    expect(callData(h)).toBe(iface.encodeFunctionData('updateModule', [ID, utf8('Updated lesson'), HASH, raw]));
    expect(h.ipfs.addToIpfs).not.toHaveBeenCalled();
  });

  it('rejects foreign and unsafe module IDs before transport', async () => {
    const h = host();
    await expect(h.service.completeModule(HUB, `${OTHER}-${ID}`, [1])).rejects.toThrow(/different EducationHub/);
    await expect(h.service.completeModule(HUB, Number(ID), [1])).rejects.toThrow(/exact integer string/);
    await expect(h.service.completeModule(HUB, `${HUB}-not-an-id`, [1])).rejects.toThrow();
    expect(h.manager.execute).not.toHaveBeenCalled();
  });

  it.each([-1, 256, 0.5, undefined, NaN])('rejects invalid answer %s before storage/transport', async answer => {
    const h = host();
    await expect(h.service.createModule(HUB, data({ correctAnswers: [answer] }))).rejects.toThrow(/0-255/);
    await expect(h.service.completeModule(HUB, ID, [answer])).rejects.toThrow(/0-255/);
    expect(h.ipfs.addToIpfs).not.toHaveBeenCalled();
    expect(h.manager.execute).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.0000000000000000001', 'Infinity'])('rejects invalid reward %s before pinning', async payout => {
    const h = host();
    await expect(h.service.createModule(HUB, data({ payout }))).rejects.toThrow();
    expect(h.ipfs.addToIpfs).not.toHaveBeenCalled();
    expect(h.manager.execute).not.toHaveBeenCalled();
  });

  it('preserves storage/transport error identity and host failure envelopes', async () => {
    const h = host();
    const storageError = new Error('mock storage failure');
    h.ipfs.addToIpfs.mockRejectedValueOnce(storageError);
    await expect(h.service.createModule(HUB, data())).rejects.toBe(storageError);
    expect(h.manager.execute).not.toHaveBeenCalled();
    const transportError = new Error('mock signing transport failure');
    h.manager.execute.mockRejectedValueOnce(transportError);
    await expect(h.service.completeModule(HUB, ID, [0])).rejects.toBe(transportError);
    const failedResult = { success: false, error: { userMessage: 'Try again' } };
    h.manager.execute.mockResolvedValueOnce(failedResult);
    await expect(h.service.completeModule(HUB, ID, [0])).resolves.toBe(failedResult);
  });

  it('rejects a malformed content pointer and unsafe raw payout on update', async () => {
    const h = host();
    await expect(h.service.updateModule(HUB, ID, { name: 'Lesson', payoutWei: '1', contentHash: 'text' })).rejects.toThrow();
    await expect(h.service.updateModule(HUB, ID, { name: 'Lesson', payoutWei: Number(ID), contentHash: CID })).rejects.toThrow();
    expect(h.manager.execute).not.toHaveBeenCalled();
  });
});
