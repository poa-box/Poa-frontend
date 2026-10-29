import { keccak256 } from '@ethersproject/keccak256';
import { toUtf8Bytes } from '@ethersproject/strings';
import { createContractFactory } from '@/services/web3/core/ContractFactory';
import { createTransactionManager } from '@/services/web3/core/TransactionManager';
import { createSmartAccountTransactionManager } from '@/services/web3/core/SmartAccountTransactionManager';
import { createEOA7702TransactionManager } from '@/services/web3/eip7702/EOA7702TransactionManager';
import { resolveAccountDeployment, restoreCredentialKeys } from '@/services/web3/passkey/accountReadiness';
import { savePasskeyCredential } from '@/services/web3/passkey/passkeyStorage';
import { encodeSolidarityOnboardingPaymasterData } from '@/services/web3/passkey/paymasterData';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS } from '@/util/passkeyQueries';
import { getClient } from '@/util/apolloClient';
import { DEFAULT_DEPLOY_CHAIN_ID } from '@/config/networks';
import { checkWallet7702Support } from '@/services/web3/eip7702/authorizationBuilder';
import { EOA_DELEGATION_ADDRESS } from '@/config/contracts';

/** Account actions use their registration source; organization/default chains cannot override it. */
export async function createAccountHost({ source, accountAddress, isPasskeyUser, passkeyState, ensureWallet, guard, onStateChange }) {
  guard();
  if (source.account?.toLowerCase() !== accountAddress?.toLowerCase()) throw new Error('Your account changed. Please try again.');
  const clients = createChainClients(source.chainId);
  if (!clients) throw new Error('This account network is unavailable. Please try again.');
  const infra = await getClient(source.endpoint).query({ query: FETCH_INFRASTRUCTURE_ADDRESSES });
  guard();
  if (infra.errors?.length) throw new Error('Account information is unavailable. Please try again.');
  const paymasterAddress = source.chainId === DEFAULT_DEPLOY_CHAIN_ID ? infra.data?.poaManagerContracts?.[0]?.paymasterHubProxy : null;
  const common = { accountAddress, ...clients, chainId: source.chainId, scopeGuard: guard,
    submissionContext: { authType: isPasskeyUser ? 'passkey' : 'eoa', scopeKey: keccak256(toUtf8Bytes(JSON.stringify([source.chainId, source.endpoint, source.contract, accountAddress]))) }, paymasterAddress,
    paymasterDataEntries: paymasterAddress ? [encodeSolidarityOnboardingPaymasterData()] : null };
  if (isPasskeyUser) {
    const credential = await restoreCredentialKeys(passkeyState, {
      clientForChain: chainId => createChainClients(chainId)?.publicClient, guard,
    });
    guard();
    savePasskeyCredential(credential);
    const factory = await getClient(source.endpoint).query({ query: FETCH_PASSKEY_FACTORY_ADDRESS });
    guard();
    if (factory.errors?.length) throw new Error('Account information is unavailable. Please try again.');
    const deployment = await resolveAccountDeployment({ credential, factoryAddress: factory.data?.passkeyAccountFactories?.[0]?.id,
      publicClient: clients.publicClient, chainId: source.chainId, guard });
    return { factory: createContractFactory(null), manager: createSmartAccountTransactionManager({ ...common,
      rawCredentialId: credential.rawCredentialId, initCode: deployment.initCode }), onStateChange };
  }
  // Reacquire at send time too: an upload or another wallet prompt can change identity/network.
  const ensureChain = async () => {
    guard();
    const wallet = await ensureWallet(source.chainId);
    guard();
    const address = await wallet.signer.getAddress();
    guard();
    if (address.toLowerCase() !== accountAddress.toLowerCase()
      || Number(await wallet.walletClient.request({ method: 'eth_chainId' })) !== source.chainId) {
      throw new Error('Your account or network changed. Please try again.');
    }
    guard();
    return wallet;
  };
  const wallet = await ensureChain();
  const direct = createTransactionManager(wallet.signer, { scopeGuard: guard, accountAddress, chainId: source.chainId, submissionContext: common.submissionContext, ...clients, ensureChain: async () => (await ensureChain()).signer });
  const capable = await checkWallet7702Support(wallet.walletClient);
  guard();
  if (!capable) return { factory: createContractFactory(wallet.signer), manager: direct, onStateChange };
  return { factory: createContractFactory(wallet.signer), manager: createEOA7702TransactionManager({ ...common,
    walletClient: wallet.walletClient, eoaDelegationAddress: EOA_DELEGATION_ADDRESS,
    ensureChain, fallbackTxManager: direct }), onStateChange };
}
