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

  // Try getCapabilities first (EIP-5792) for explicit confirmation
  try {
    if (walletClient.getCapabilities) {
      const caps = await walletClient.getCapabilities();
      const chainCaps = Object.values(caps || {});
      if (chainCaps.some(c => c?.atomicBatch?.supported || c?.authorization?.supported)) {
        return true;
      }
    }
  } catch {
    // getCapabilities not supported — fall through to method check
  }

  // signAuthorization method exists on the client — trust it.
  // Runtime failures are handled gracefully in EOA7702TransactionManager
  // and useProfileUpdate (both fall back to direct tx on error).
  return typeof walletClient.signAuthorization === 'function';
}
