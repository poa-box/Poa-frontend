import { decodeAbiParameters } from 'viem';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';
import TaskManagerABI from '../../../../abi/TaskManagerNew.json';

/** Keep the full ABI's error decoding while loading read dependencies on demand. */
export async function readTaskManagerV4State(chainId, address) {
  const publicClient = createPublicClientForChain(chainId);
  if (!publicClient) return null;
  const readLens = (key) => publicClient.readContract({
    address,
    abi: TaskManagerABI,
    functionName: 'getLensData',
    args: [key, '0x'],
  });
  const [rawRoot, rawIds] = await Promise.all([readLens(10), readLens(11)]);
  const [foldersRoot] = decodeAbiParameters([{ type: 'bytes32' }], rawRoot);
  const [ids] = decodeAbiParameters([{ type: 'uint256[]' }], rawIds);
  return { foldersRoot, organizerHatIds: ids.map((id) => id.toString()) };
}
