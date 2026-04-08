/**
 * walletSigner.js
 * Sign ERC-4337 UserOp hashes using a connected wallet (ECDSA via personal_sign).
 * Used for EIP-7702 delegated EOAs where the wallet's native key validates the UserOp.
 */

/**
 * Sign a UserOp hash with the connected wallet.
 * The EOADelegation contract recovers using toEthSignedMessageHash(userOpHash),
 * so we sign via signMessage which applies the EIP-191 prefix.
 *
 * @param {string} userOpHash - bytes32 hex string
 * @param {Object} walletClient - viem WalletClient from wagmi
 * @returns {Promise<string>} 65-byte ECDSA signature (r, s, v)
 */
export async function signUserOpWithWallet(userOpHash, walletClient) {
  return walletClient.signMessage({
    message: { raw: userOpHash },
  });
}
