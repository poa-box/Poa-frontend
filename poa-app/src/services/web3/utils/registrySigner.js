/**
 * EIP-712 Signing Utility for UniversalAccountRegistry
 *
 * Produces the signature required by registerAccountBySig().
 * Reusable across deploy, QuickJoin, and any future flow that registers usernames.
 */

import { ethers } from 'ethers';
import UniversalAccountRegistryABI from '../../../../abi/UniversalAccountRegistry.json';

// EIP-712 domain constants — must match UniversalAccountRegistry.sol
const DOMAIN_NAME = 'UniversalAccountRegistry';
const DOMAIN_VERSION = '1';

// EIP-712 type definition — matches _REGISTER_TYPEHASH in the contract
const REGISTER_ACCOUNT_TYPES = {
  RegisterAccount: [
    { name: 'user', type: 'address' },
    { name: 'username', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Fetch the user's current nonce from the UniversalAccountRegistry.
 * @param {string} registryAddress
 * @param {string} userAddress
 * @param {ethers.providers.Provider} provider
 * @returns {Promise<ethers.BigNumber>}
 */
export async function fetchRegistryNonce(registryAddress, userAddress, provider) {
  const registry = new ethers.Contract(registryAddress, UniversalAccountRegistryABI, provider);
  return registry.nonces(userAddress);
}

/**
 * Check whether the user already has a registered username on-chain.
 * @param {string} registryAddress
 * @param {string} userAddress
 * @param {ethers.providers.Provider} provider
 * @returns {Promise<string>} Username string (empty if none)
 */
export async function fetchExistingUsername(registryAddress, userAddress, provider) {
  const registry = new ethers.Contract(registryAddress, UniversalAccountRegistryABI, provider);
  return registry.getUsername(userAddress);
}

/**
 * Sign an EIP-712 RegisterAccount message for the UniversalAccountRegistry.
 *
 * @param {Object} params
 * @param {ethers.Signer} params.signer - Ethers v5 signer (must support _signTypedData)
 * @param {string} params.registryAddress - UniversalAccountRegistry contract address
 * @param {string} params.username - Username to register
 * @param {number} [params.deadlineSeconds=300] - Seconds until the signature expires
 * @returns {Promise<{ deadline: ethers.BigNumber, nonce: ethers.BigNumber, signature: string }>}
 */
export async function signRegistration({ signer, registryAddress, username, deadlineSeconds = 300 }) {
  if (!signer) throw new Error('Signer is required for EIP-712 signing');
  if (!registryAddress) throw new Error('Registry address is required');
  if (!username || username.trim().length === 0) throw new Error('Username is required');

  const chainId = await signer.getChainId();
  const userAddress = await signer.getAddress();

  // Read current nonce from the registry contract
  const nonce = await fetchRegistryNonce(registryAddress, userAddress, signer.provider);

  // Deadline based on latest block timestamp (avoids client-clock skew)
  const block = await signer.provider.getBlock('latest');
  const deadline = ethers.BigNumber.from(block.timestamp).add(deadlineSeconds);

  const domain = {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract: registryAddress,
  };

  const message = {
    user: userAddress,
    username,
    nonce,
    deadline,
  };

  // ethers v5: _signTypedData calls eth_signTypedData_v4
  const signature = await signer._signTypedData(domain, REGISTER_ACCOUNT_TYPES, message);

  return { deadline, nonce, signature };
}

/**
 * Safe defaults that cause the contract to silently skip username registration.
 * Use when: passkey user, user already has a username, or no username provided.
 * @returns {{ regDeadline: number, regNonce: number, regSignature: string }}
 */
export function getSkipRegistrationDefaults() {
  return {
    regDeadline: 0,
    regNonce: 0,
    regSignature: '0x',
  };
}
