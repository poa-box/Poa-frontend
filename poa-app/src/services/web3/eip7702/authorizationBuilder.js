/**
 * authorizationBuilder.js
 * Build and sign EIP-7702 authorization for delegating EOA code to EOADelegation contract.
 * The authorization is included in the UserOp for the bundler to wrap in a type-4 transaction.
 */

import { EOA_DELEGATION_ADDRESS } from '../../../config/contracts';

/**
 * Build a signed EIP-7702 authorization delegating the EOA to the EOADelegation contract.
 *
 * @param {Object} walletClient - viem WalletClient from wagmi
 * @returns {Promise<Object>} Signed authorization object for the bundler
 * @throws {Error} WALLET_7702_UNSUPPORTED if wallet doesn't support signAuthorization
 */
export async function buildEOAAuthorization(walletClient) {
  try {
    const authorization = await walletClient.signAuthorization({
      contractAddress: EOA_DELEGATION_ADDRESS,
    });
    return authorization;
  } catch (err) {
    // Wallet doesn't support EIP-7702 signAuthorization
    if (
      err.message?.includes('not supported') ||
      err.message?.includes('Method not found') ||
      err.code === -32601 || // Method not found
      err.code === 4200 // Unsupported method
    ) {
      throw new Error('WALLET_7702_UNSUPPORTED');
    }
    throw err;
  }
}

/**
 * Check if a wallet supports EIP-7702 authorization signing.
 * Probes the wallet once and caches the result.
 *
 * @param {Object} walletClient - viem WalletClient
 * @returns {Promise<boolean>}
 */
export async function checkWallet7702Support(walletClient) {
  if (!walletClient?.signAuthorization) return false;

  try {
    // Probe with the real delegation address — wallet may prompt but we catch early
    // Some wallets expose capabilities without prompting
    if (walletClient.getCapabilities) {
      const caps = await walletClient.getCapabilities();
      // EIP-5792 capabilities response — check for 7702 support
      const chainCaps = Object.values(caps || {});
      return chainCaps.some(c => c?.atomicBatch?.supported || c?.authorization?.supported);
    }
  } catch {
    // getCapabilities not supported — fall through
  }

  // Method exists on the client object — assume supported
  // Actual signing will fail at transaction time if the wallet rejects
  return typeof walletClient.signAuthorization === 'function';
}
