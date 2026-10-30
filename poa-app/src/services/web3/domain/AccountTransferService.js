import { requireRawUint } from '@poa-box/core/amounts';
import { cashoutHistoryCoverage, cashoutRecoveryDecision, cashoutRowKey, sameCashoutRecovery } from '@/services/web3/domain/accountFinancialEvidence';

async function currentWallet(getSigner, accountAddress, chainId, guard) {
  guard();
  const wallet = await getSigner();
  guard();
  const chain = await wallet?.getChainId();
  guard();
  const address = await wallet?.getAddress();
  guard();
  if (!wallet || Number(chain) !== chainId || address?.toLowerCase() !== accountAddress.toLowerCase()) {
    throw new Error('Your wallet account or network changed. Please try again.');
  }
  return wallet;
}

/** Account actions have a selected asset chain, independent of the current org.
 * Construct only when an action starts; signing/runtime bundles stay lazy. */
export async function createAccountTransferService({ chainId, accountAddress, isPasskeyUser,
  rawCredentialId, getSigner, guard = () => {} }) {
  guard();
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !accountAddress) {
    throw new Error('Choose an account and network before continuing.');
  }
  const { ContractFactory } = await import('@/services/web3/core/ContractFactory');
  guard();
  let signer = null;
  let manager;
  if (isPasskeyUser) {
    const { createChainClients } = await import('@/services/web3/utils/chainClients');
    guard();
    const clients = createChainClients(chainId);
    if (!clients || !rawCredentialId) throw new Error('Sign in again to use this account.');
    const code = await clients.publicClient.getBytecode({ address: accountAddress });
    guard();
    if (!code || code === '0x') throw new Error('Your account is not available on this network yet. Join an organization here first.');
    const { SmartAccountTransactionManager } = await import('@/services/web3/core/SmartAccountTransactionManager');
    guard();
    manager = new SmartAccountTransactionManager({ ...clients, chainId, accountAddress,
      rawCredentialId, paymasterAddress: null, scopeGuard: guard });
  } else {
    signer = await currentWallet(getSigner, accountAddress, chainId, guard);
    guard();
    const { TransactionManager } = await import('@/services/web3/core/TransactionManager');
    guard();
    manager = new TransactionManager(signer, { chainId, accountAddress, scopeGuard: guard,
      ensureChain: async () => {
        return currentWallet(getSigner, accountAddress, chainId, guard);
      } });
  }
  const { TreasuryService } = await import('@/services/web3/domain/TreasuryService');
  guard();
  return new AccountTransferService(new ContractFactory(signer, signer?.provider), manager,
    { guard, chainId, accountAddress, isPasskeyUser, signer, getSigner, TreasuryService });
}

export class AccountTransferService {
  constructor(factory, manager, { guard = () => {}, chainId, accountAddress, isPasskeyUser, signer, getSigner, TreasuryService }) {
    Object.assign(this, { factory, manager, guard, chainId, accountAddress, isPasskeyUser, signer, getSigner });
    this.treasury = new TreasuryService(factory, manager);
  }
  transferERC20(token, recipient, amountRaw, options) {
    this.guard();
    return this.treasury.transferERC20(token, recipient, requireRawUint(amountRaw), options);
  }
  async approveIfNeeded(approval, options) {
    this.guard();
    if (this.isPasskeyUser) throw new Error('Cashout currently requires a connected wallet.');
    const amount = requireRawUint(approval.amount);
    const allowance = await this.treasury.getAllowance(approval.token, this.accountAddress, approval.spender);
    this.guard();
    if (BigInt(allowance) >= BigInt(amount)) return { success: true, approvalRequired: false };
    // Preserve the reviewed one-time Permit2 approval policy exactly.
    const maximum = ((1n << 256n) - 1n).toString();
    return this.treasury.approveToken(approval.token, approval.spender, maximum, options);
  }
  async signCashout(typedData) {
    this.guard();
    if (this.isPasskeyUser) throw new Error('Cashout currently requires a connected wallet.');
    const wallet = await currentWallet(this.getSigner, this.accountAddress, this.chainId, this.guard);
    this.guard();
    // ethers v5 expects types without the external quote's EIP712Domain entry.
    const { EIP712Domain, ...types } = typedData.types || {};
    const signature = await wallet._signTypedData(typedData.domain, types, typedData.message);
    this.guard();
    return signature;
  }
  async recoverCashout(row, options) {
    this.guard();
    if (this.isPasskeyUser) throw new Error('Cashout recovery currently requires a connected wallet.');
    const [{ CASHOUT_DESCRIPTOR, BASE_CHAIN_ID, fetchOutstandingDeposits }, builders, { executeCoreIntent }] = await Promise.all([
      import('@/services/web3/domain/CashOutService'), import('@poa-box/core/integrations/cashout'),
      import('@/services/web3/core/coreIntent'),
    ]);
    this.guard();
    if (this.chainId !== BASE_CHAIN_ID) throw new Error('Switch to the cashout network before continuing.');
    const decision = (candidate, coverage) => cashoutRecoveryDecision({ row: candidate, descriptor: CASHOUT_DESCRIPTOR,
      accountAddress: this.accountAddress, chainId: this.chainId, canTransact: true, isPasskeyUser: this.isPasskeyUser, coverage });
    if (!decision(row, { status: 'complete' }).allowed) throw new Error('Recovery details unavailable. Refresh before continuing.');
    await currentWallet(this.getSigner, this.accountAddress, this.chainId, this.guard);
    this.guard();
    const observed = await fetchOutstandingDeposits(this.accountAddress);
    this.guard();
    const matches = observed.filter(candidate => cashoutRowKey(candidate) === cashoutRowKey(row));
    const fresh = matches.length === 1 ? matches[0] : null;
    if (!fresh || !decision(fresh, cashoutHistoryCoverage(observed)).allowed || !sameCashoutRecovery(row, fresh)) {
      throw new Error('This cashout changed or is unavailable. Refresh and review it again.');
    }
    await currentWallet(this.getSigner, this.accountAddress, this.chainId, this.guard);
    this.guard();
    const intent = fresh.kind === 'unfilled'
      ? builders.buildWithdrawDeposit({ descriptor: CASHOUT_DESCRIPTOR, depositId: requireRawUint(fresh.depositId.toString()) })
      : fresh.kind === 'failed' ? builders.buildRecoverFailed({ descriptor: CASHOUT_DESCRIPTOR, requestHash: fresh.requestHash }) : null;
    if (!intent) throw new Error('This cashout cannot be recovered with the selected action.');
    return executeCoreIntent(this.factory, this.manager, intent, options);
  }
}
