import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
const clientForChain = vi.hoisted(() => vi.fn());
vi.mock('@/services/web3/utils/publicChainClient', () => ({ createPublicClientForChain: clientForChain }));
import { readTaskManagerV4State } from '@/services/web3/read/taskManagerV4State';

const TM = '0x' + '12'.repeat(20);
const ROOT = '0x' + 'ab'.repeat(32);

describe('deferred TaskManager public read adapter', () => {
  it('uses the requested organization chain and core lenses without signing', async () => {
    const readContract = vi.fn(async request => {
      if (request.args[0] === 10) return ethers.utils.defaultAbiCoder.encode(['bytes32'], [ROOT]);
      if (request.args[0] === 11) return ethers.utils.defaultAbiCoder.encode(['uint256[]'], [['9007199254740993']]);
      throw new Error('unexpected lens');
    });
    clientForChain.mockReturnValue({ readContract });
    await expect(readTaskManagerV4State(100, TM)).resolves.toEqual({ foldersRoot: ROOT, organizerHatIds: ['9007199254740993'] });
    expect(clientForChain).toHaveBeenCalledWith(100);
    expect(readContract.mock.calls.map(([r]) => [r.address, r.functionName, r.args])).toEqual([
      [TM, 'getLensData', [10, '0x']], [TM, 'getLensData', [11, '0x']],
    ]);
    expect(readContract.mock.calls[0][0].abi.some(f => f.type === 'error' && f.name === 'FoldersRootStale')).toBe(true);
  });
  it('returns null for unsupported chains and preserves read errors', async () => {
    clientForChain.mockReturnValueOnce(null);
    await expect(readTaskManagerV4State(987654, TM)).resolves.toBeNull();
    const error = new Error('mock chain transport');
    clientForChain.mockReturnValueOnce({ readContract: vi.fn().mockRejectedValue(error) });
    await expect(readTaskManagerV4State(100, TM)).rejects.toBe(error);
  });
});
