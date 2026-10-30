/**
 * TreasuryService
 * Handles PaymentManager operations for treasury distributions
 */

import { ethers } from 'ethers';
import { PaymentManagerAbi as PaymentManagerABI } from '@poa-box/core/abis/PaymentManager';
import { ERC20Abi as ERC20ABI } from '@poa-box/core/abis/ERC20';
import { requireAddress } from '@/services/web3/utils/validation';
import { requireRawUint } from '@poa-box/core/amounts';
import { buildApproveErc20, buildPayErc20, buildClaimDistribution, buildOptOut, parseProof } from '@poa-box/core/tx/treasury';
import { buildDepositForOrg } from '@poa-box/core/tx/paymaster';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';

const positiveRaw = (amount, label) => {
  const raw = requireRawUint(amount && typeof amount === 'object' ? amount.toString() : amount);
  if (raw === '0') throw new Error(`${label} must be greater than 0`);
  return raw;
};

/**
 * TreasuryService - Distribution and payment management
 */
export class TreasuryService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   */
  constructor(contractFactory, transactionManager) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
  }

  execute(intent, options) {
    return executeCoreIntent(this.factory, this.txManager, intent, options);
  }

  // Core's canonical ABI owns the remaining simple calls without named builders.
  call(to, abi, method, args, options) {
    return this.execute({ to, abi, method, args, meta: { domain: 'treasury', action: method } }, options);
  }

  // ============================================
  // Deposit Functions
  // ============================================

  /**
   * Approve an ERC20 token for spending by the PaymentManager
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} spenderAddress - Address to approve (PaymentManager)
   * @param {string} amount - Amount to approve (in wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async approveToken(tokenAddress, spenderAddress, amount, options = {}) {
    requireAddress(tokenAddress, 'Token address');
    requireAddress(spenderAddress, 'Spender address');

    return this.execute(buildApproveErc20({ tokenAddress, spender: spenderAddress, amountWei: positiveRaw(amount, 'Approval amount') }), options);
  }

  /**
   * Deposit ERC20 tokens into the PaymentManager treasury
   * @param {string} contractAddress - PaymentManager contract address
   * @param {string} tokenAddress - ERC20 token to deposit
   * @param {string} amount - Amount to deposit (in wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async depositERC20(contractAddress, tokenAddress, amount, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requireAddress(tokenAddress, 'Token address');

    return this.execute(buildPayErc20({ paymentManagerAddress: contractAddress, tokenAddress, amountWei: positiveRaw(amount, 'Deposit amount') }), options);
  }

  /**
   * Transfer ERC20 tokens directly to a recipient (e.g., TaskManager for bounty funding).
   * Uses plain ERC20.transfer — no approval needed since tokens come from caller's balance.
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} recipientAddress - Destination address (e.g., TaskManager)
   * @param {string} amount - Amount to transfer (in wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async transferERC20(tokenAddress, recipientAddress, amount, options = {}) {
    requireAddress(tokenAddress, 'Token address');
    requireAddress(recipientAddress, 'Recipient address');

    return this.call(tokenAddress, ERC20ABI, 'transfer', [recipientAddress, positiveRaw(amount, 'Transfer amount')], options);
  }

  /**
   * Get current ERC20 allowance
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} ownerAddress - Token owner address
   * @param {string} spenderAddress - Approved spender address
   * @returns {Promise<string>} Current allowance in wei
   */
  async getAllowance(tokenAddress, ownerAddress, spenderAddress) {
    requireAddress(tokenAddress, 'Token address');
    requireAddress(ownerAddress, 'Owner address');
    requireAddress(spenderAddress, 'Spender address');

    const contract = this.factory.createReadOnly(tokenAddress, ERC20ABI);
    const allowance = await contract.allowance(ownerAddress, spenderAddress);
    return allowance.toString();
  }

  /**
   * Get ERC20 token balance for an account
   * @param {string} tokenAddress - ERC20 token contract address
   * @param {string} accountAddress - Account to check balance of
   * @returns {Promise<string>} Balance in wei
   */
  async getTokenBalance(tokenAddress, accountAddress) {
    requireAddress(tokenAddress, 'Token address');
    requireAddress(accountAddress, 'Account address');

    const contract = this.factory.createReadOnly(tokenAddress, ERC20ABI);
    const balance = await contract.balanceOf(accountAddress);
    return balance.toString();
  }

  // ============================================
  // Gas Pool Functions
  // ============================================

  /**
   * Deposit native token (ETH/xDAI) to the org's gas pool via PaymasterHub.depositForOrg
   * @param {string} paymasterHubAddress - PaymasterHub proxy address
   * @param {string} orgId - Organization ID (bytes32)
   * @param {string} amount - Amount to deposit (in wei)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async depositToGasPool(paymasterHubAddress, orgId, amount, options = {}) {
    requireAddress(paymasterHubAddress, 'PaymasterHub address');

    return this.execute(buildDepositForOrg({ paymasterHubAddress, orgId, amountWei: positiveRaw(amount, 'Deposit amount') }), options);
  }

  // ============================================
  // Distribution Functions
  // ============================================

  /**
   * Create a new distribution for profit sharing
   * @param {string} contractAddress - PaymentManager contract address
   * @param {string} payoutToken - ERC20 token address for distribution (address(0) for ETH)
   * @param {string} amount - Total amount to distribute (in wei)
   * @param {string} merkleRoot - Merkle root for claim verification
   * @param {number|string} checkpointBlock - Block number for snapshot
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createDistribution(contractAddress, payoutToken, amount, merkleRoot, checkpointBlock, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requireAddress(payoutToken, 'Payout token address');

    return this.call(contractAddress, PaymentManagerABI, 'createDistribution',
      [payoutToken, positiveRaw(amount, 'Distribution amount'), merkleRoot, requireRawUint(checkpointBlock)], options);
  }

  /**
   * Claim from a distribution
   * @param {string} contractAddress - PaymentManager contract address
   * @param {number|string} distributionId - Distribution ID to claim from
   * @param {string} claimAmount - Amount to claim (in wei)
   * @param {string[]} merkleProof - Merkle proof for claim verification
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async claimDistribution(contractAddress, distributionId, claimAmount, merkleProof, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    return this.execute(buildClaimDistribution({ paymentManagerAddress: contractAddress,
      distributionId: requireRawUint(distributionId), amountWei: positiveRaw(claimAmount, 'Claim amount'), proof: parseProof(merkleProof) }), options);
  }

  /**
   * Claim from multiple distributions in one transaction
   * @param {string} contractAddress - PaymentManager contract address
   * @param {Array<{distributionId: string, amount: string, proof: string[]}>} claims - Array of claims
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async claimMultiple(contractAddress, claims, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    if (!claims || claims.length === 0) {
      throw new Error('At least one claim is required');
    }

    return this.call(contractAddress, PaymentManagerABI, 'claimMultiple', [
      claims.map(c => requireRawUint(c.distributionId)),
      claims.map(c => positiveRaw(c.amount, 'Claim amount')),
      claims.map(c => parseProof(c.proof)),
    ], options);
  }

  /**
   * Finalize a distribution (return unclaimed funds)
   * @param {string} contractAddress - PaymentManager contract address
   * @param {number|string} distributionId - Distribution ID to finalize
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async finalizeDistribution(contractAddress, distributionId, minClaimPeriodBlocks = 0, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    return this.call(contractAddress, PaymentManagerABI, 'finalizeDistribution',
      [requireRawUint(distributionId), requireRawUint(minClaimPeriodBlocks || 0)], options);
  }

  // ============================================
  // View Functions
  // ============================================

  /**
   * Get the current distribution counter
   * @param {string} contractAddress - PaymentManager contract address
   * @returns {Promise<string>} Distribution counter
   */
  async getDistributionCounter(contractAddress) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const counter = await contract.distributionCounter();

    return counter.toString();
  }

  /**
   * Get distribution details
   * @param {string} contractAddress - PaymentManager contract address
   * @param {number|string} distributionId - Distribution ID
   * @returns {Promise<Object>} Distribution details
   */
  async getDistribution(contractAddress, distributionId) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const id = ethers.BigNumber.from(distributionId);
    const result = await contract.getDistribution(id);

    return {
      payoutToken: result.payoutToken,
      totalAmount: result.totalAmount.toString(),
      totalClaimed: result.totalClaimed.toString(),
      checkpointBlock: result.checkpointBlock.toString(),
      merkleRoot: result.merkleRoot,
      finalized: result.finalized,
    };
  }

  /**
   * Check if a user has claimed from a distribution
   * @param {string} contractAddress - PaymentManager contract address
   * @param {number|string} distributionId - Distribution ID
   * @param {string} userAddress - User address to check
   * @returns {Promise<boolean>} Whether user has claimed
   */
  async hasClaimed(contractAddress, distributionId, userAddress) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requireAddress(userAddress, 'User address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const id = ethers.BigNumber.from(distributionId);
    const claimed = await contract.hasClaimed(id, userAddress);

    return claimed;
  }

  /**
   * Get the revenue share token address
   * @param {string} contractAddress - PaymentManager contract address
   * @returns {Promise<string>} Revenue share token address
   */
  async getRevenueShareToken(contractAddress) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const token = await contract.revenueShareToken();

    return token;
  }

  /**
   * Check if a user has opted out of distributions
   * @param {string} contractAddress - PaymentManager contract address
   * @param {string} userAddress - User address to check
   * @returns {Promise<boolean>} Whether user has opted out
   */
  async isOptedOut(contractAddress, userAddress) {
    requireAddress(contractAddress, 'PaymentManager contract address');
    requireAddress(userAddress, 'User address');

    const contract = this.factory.createReadOnly(contractAddress, PaymentManagerABI);
    const optedOut = await contract.isOptedOut(userAddress);

    return optedOut;
  }

  /**
   * Toggle opt-out status for distributions
   * @param {string} contractAddress - PaymentManager contract address
   * @param {boolean} optOut - Whether to opt out
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async toggleOptOut(contractAddress, optOut, options = {}) {
    requireAddress(contractAddress, 'PaymentManager contract address');

    return this.execute(buildOptOut({ paymentManagerAddress: contractAddress, optOut }), options);
  }
}

/**
 * Create a TreasuryService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @returns {TreasuryService}
 */
export function createTreasuryService(factory, txManager) {
  return new TreasuryService(factory, txManager);
}

/** Public fee-fund reads use the core ABI, without loading a wallet or signing manager. */
export async function readOrgFeeFund(client, { orgId, chainId, hubAddress, endpoint }) {
  const { PaymasterHubAbi } = await import('@poa-box/core/abis/PaymasterHub');
  requireAddress(hubAddress, 'Fee fund address');
  if (!ethers.utils.isHexString(orgId, 32)) throw new Error('Fee fund organization unavailable');
  if (BigInt(await client.request({ method: 'eth_chainId' })) !== BigInt(chainId)) throw new Error('Fee fund chain mismatch');
  const observed = await client.request({ method: 'eth_getBlockByNumber', params: ['latest', false] });
  const number = requireRawUint(BigInt(observed.number));
  if (!/^0x[\da-fA-F]{64}$/.test(observed.hash)) throw new Error('Fee fund block unavailable');
  const address = ethers.utils.getAddress(hubAddress.toLowerCase());
  const [financials, config] = await Promise.all(['getOrgFinancials', 'getOrgConfig'].map(functionName =>
    client.readContract({ address, abi: PaymasterHubAbi, functionName, args: [orgId], blockNumber: BigInt(number) })));
  const fields = (method, raw) => Object.fromEntries(PaymasterHubAbi.find(entry => entry.name === method).outputs[0].components
    .map((entry, index) => [entry.name, raw[entry.name] ?? raw[index]]));
  const money = fields('getOrgFinancials', financials), settings = fields('getOrgConfig', config);
  const deposited = requireRawUint(String(money.deposited)), spent = requireRawUint(String(money.spent));
  const again = await client.request({ method: 'eth_getBlockByNumber', params: [`0x${BigInt(number).toString(16)}`, false] });
  if (again?.hash?.toLowerCase() !== observed.hash.toLowerCase()) throw new Error('Fee fund block changed');
  // The current getter's spent includes the fee debit; do not add an indexed subsidy twice.
  const available = BigInt(deposited) > BigInt(spent) ? (BigInt(deposited) - BigInt(spent)).toString() : '0';
  return { deposited, spent, available, registered: requireRawUint(String(settings.registeredAt)) !== '0',
    source: { chainId, orgId, contract: address, endpoint, method: 'eth_call', indexed: false,
      snapshot: 'pinned', block: { number, hash: observed.hash } } };
}
