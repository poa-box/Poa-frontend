import { buildDonateToSolidarity } from '@poa-box/core/tx/paymaster';
import { getNetworkByChainId } from '@/config/networks';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';

const address = value => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);

// This action has its own selected chain; it never uses an organization's runtime.
export async function createProtocolDonationService({ chainId, accountAddress, isPasskeyUser, source,
  paymasterAddress, getSigner, guard = () => {} }) {
  guard();
  const network = getNetworkByChainId(chainId);
  if (!network || !address(accountAddress) || isPasskeyUser) throw new Error('Connect a wallet before donating.');
  if (!address(paymasterAddress) || source?.chainId !== chainId || source?.endpoint !== network.subgraphUrl
    || source?.contract?.toLowerCase() !== paymasterAddress.toLowerCase()) {
    throw new Error('Donation details are unavailable for this network. Refresh and try again.');
  }
  const boundSigner = async () => {
    guard();
    const signer = await getSigner();
    guard();
    if (!signer || Number(await signer.getChainId()) !== chainId
      || (await signer.getAddress()).toLowerCase() !== accountAddress.toLowerCase()) {
      throw new Error('Your wallet account or network changed. Please try again.');
    }
    guard();
    return signer;
  };
  const signer = await boundSigner();
  const [{ ContractFactory }, { TransactionManager }] = await Promise.all([
    import('@/services/web3/core/ContractFactory'), import('@/services/web3/core/TransactionManager'),
  ]);
  guard();
  const factory = new ContractFactory(signer, signer.provider);
  const manager = new TransactionManager(signer, { chainId, accountAddress, scopeGuard: guard, ensureChain: boundSigner });
  return {
    async donate(amountRaw, options = {}) {
      guard();
      const intent = buildDonateToSolidarity({ paymasterHubAddress: paymasterAddress, amountWei: amountRaw });
      const result = await executeCoreIntent(factory, manager, intent, options);
      guard();
      return result;
    },
  };
}
