import { ethers } from 'ethers';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';
import { getAbi } from '@poa-box/core/contracts';
import { getFoldersRoot, getOrganizerHats } from '@poa-box/core/task-lens';

const TaskManagerABI = getAbi('TaskManagerNew');
const lensInterface = new ethers.utils.Interface(TaskManagerABI);

/** Keep the full ABI's error decoding in the deferred host read transport. */
export async function readTaskManagerV4State(chainId, address) {
  const publicClient = createPublicClientForChain(chainId);
  if (!publicClient) return null;
  const provider = { call: async ({ to, data }) => {
    const [key, params] = lensInterface.decodeFunctionData('getLensData', data);
    const raw = await publicClient.readContract({
      address: to, abi: TaskManagerABI, functionName: 'getLensData', args: [key, params],
    });
    return lensInterface.encodeFunctionResult('getLensData', [raw]);
  } };
  const [foldersRoot, ids] = await Promise.all([
    getFoldersRoot(provider, address), getOrganizerHats(provider, address),
  ]);
  return { foldersRoot, organizerHatIds: ids.map(id => id.toString()) };
}
