/**
 * userOpBuilder.js
 * Construct, pack, and hash ERC-4337 v0.7 UserOperations.
 *
 * Uses viem for encoding and the Pimlico bundler client (from permissionless)
 * for gas estimation and submission.
 */

import {
  concat,
  pad,
  toHex,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { entryPoint07Abi } from 'viem/account-abstraction';
import { ENTRY_POINT_ADDRESS, GAS_BUFFER_PERCENT } from '../../../config/passkey';

/**
 * Build a complete UserOp ready for signing.
 *
 * @param {Object} params
 * @param {string} params.sender - Smart account address
 * @param {string} params.callData - Encoded call data (already wrapped in execute/executeBatch)
 * @param {Object} params.bundlerClient - Pimlico bundler client (from createPimlicoClient)
 * @param {Object} params.publicClient - viem public client for chain reads
 * @param {string} [params.initCode='0x'] - Factory address + init calldata for account deployment
 * @param {string} params.paymasterAddress - PaymasterHub address
 * @param {string} params.paymasterData - Encoded paymaster-specific data (after address)
 * @returns {Object} UserOperation object ready for signing
 */
export async function buildUserOp({
  sender,
  callData,
  bundlerClient,
  publicClient,
  initCode = '0x',
  paymasterAddress,
  paymasterData,
}) {
  const entryPoint = ENTRY_POINT_ADDRESS;

  // 1. Fetch nonce and gas prices in parallel (single round-trip)
  const [nonce, gasPrices] = await Promise.all([
    publicClient.readContract({
      address: entryPoint,
      abi: entryPoint07Abi,
      functionName: 'getNonce',
      args: [sender, 0n],
    }),
    bundlerClient.getUserOperationGasPrice().catch((e) => {
      console.warn('Failed to get gas price from bundler, using defaults:', e.message);
      return null;
    }),
  ]);

  // Parse initCode into factory + factoryData (v0.7 format)
  let factory = undefined;
  let factoryData = undefined;
  if (initCode && initCode !== '0x' && initCode.length > 2) {
    factory = '0x' + initCode.slice(2, 42);
    factoryData = '0x' + initCode.slice(42);
  }

  // 2. Build base UserOp with placeholder gas values and dummy signature
  const userOp = {
    sender,
    nonce,
    factory,
    factoryData,
    callData,
    callGasLimit: 500_000n,
    verificationGasLimit: 1_500_000n,
    preVerificationGas: 100_000n,
    maxFeePerGas: gasPrices?.standard?.maxFeePerGas ?? 3_000_000_000n,
    maxPriorityFeePerGas: gasPrices?.standard?.maxPriorityFeePerGas ?? 1_500_000_000n,
    ...(paymasterAddress ? {
      paymaster: paymasterAddress,
      paymasterVerificationGasLimit: 200_000n,
      paymasterPostOpGasLimit: 200_000n,
      paymasterData,
    } : {}),
    signature: DUMMY_SIGNATURE,
  };

  // 3. Estimate gas via bundler
  await estimateGas(userOp, bundlerClient);

  return userOp;
}

/**
 * Build a UserOp with paymaster fallback.
 * Fetches nonce + gas prices once, then tries gas estimation with paymaster.
 * If the paymaster rejects, strips paymaster fields and re-estimates (only the
 * estimation call is repeated, not the nonce/gas price fetches).
 *
 * @param {Object} params
 * @param {string} params.sender - Smart account address
 * @param {string} params.callData - Encoded call data
 * @param {Object} params.bundlerClient - Pimlico bundler client
 * @param {Object} params.publicClient - viem public client
 * @param {string} [params.initCode='0x'] - initCode for account deployment
 * @param {string} [params.paymasterAddress] - PaymasterHub address (optional)
 * @param {string} [params.paymasterData] - Paymaster-specific data (optional)
 * @returns {Object} UserOperation ready for signing
 */
export async function buildUserOpWithFallback({
  sender,
  callData,
  bundlerClient,
  publicClient,
  initCode = '0x',
  paymasterAddress,
  paymasterData,
}) {
  const entryPoint = ENTRY_POINT_ADDRESS;

  // 1. Fetch nonce and gas prices in parallel — done once regardless of fallback
  const [nonce, gasPrices] = await Promise.all([
    publicClient.readContract({
      address: entryPoint,
      abi: entryPoint07Abi,
      functionName: 'getNonce',
      args: [sender, 0n],
    }),
    bundlerClient.getUserOperationGasPrice().catch((e) => {
      console.warn('Failed to get gas price from bundler, using defaults:', e.message);
      return null;
    }),
  ]);

  // Parse initCode into factory + factoryData (v0.7 format)
  let factory = undefined;
  let factoryData = undefined;
  if (initCode && initCode !== '0x' && initCode.length > 2) {
    factory = '0x' + initCode.slice(2, 42);
    factoryData = '0x' + initCode.slice(42);
  }

  const baseFields = {
    sender,
    nonce,
    factory,
    factoryData,
    callData,
    callGasLimit: 500_000n,
    verificationGasLimit: 1_500_000n,
    preVerificationGas: 100_000n,
    maxFeePerGas: gasPrices?.standard?.maxFeePerGas ?? 3_000_000_000n,
    maxPriorityFeePerGas: gasPrices?.standard?.maxPriorityFeePerGas ?? 1_500_000_000n,
    signature: DUMMY_SIGNATURE,
  };

  // 2. Try with paymaster if available
  if (paymasterAddress) {
    const userOp = {
      ...baseFields,
      paymaster: paymasterAddress,
      paymasterVerificationGasLimit: 200_000n,
      paymasterPostOpGasLimit: 200_000n,
      paymasterData,
    };

    try {
      await estimateGas(userOp, bundlerClient);
      console.log('UserOp built with gas sponsorship');
      return userOp;
    } catch (e) {
      const msg = e.message || '';
      const isPaymasterRejection = msg.includes('AA31') || msg.includes('AA33')
        || msg.includes('paymaster') || msg.includes('Paymaster')
        || msg.includes('validatePaymasterUserOp');

      if (isPaymasterRejection) {
        console.warn('Paymaster rejected, falling back to self-funded:', msg);
      } else {
        throw e;
      }
    }
  }

  // 3. Self-funded (no paymaster fields)
  const userOp = { ...baseFields };
  console.log('Building self-funded UserOp (account pays gas)');
  await estimateGas(userOp, bundlerClient);
  return userOp;
}

/**
 * Run bundler gas estimation on a UserOp and apply results.
 * Mutates the userOp in place.
 */
async function estimateGas(userOp, bundlerClient) {
  try {
    const gasEstimate = await bundlerClient.estimateUserOperationGas({
      ...userOp,
      entryPointAddress: ENTRY_POINT_ADDRESS,
    });

    userOp.callGasLimit = applyBuffer(gasEstimate.callGasLimit);
    userOp.preVerificationGas = applyBuffer(gasEstimate.preVerificationGas);

    // P-256 signature verification costs ~300-400k gas on-chain (Solidity fallback)
    // or ~3k with the RIP-7212 precompile. The bundler's gas estimation uses a dummy
    // signature that quick-fails, causing it to underestimate the real verification cost.
    // Enforce a minimum to prevent AA23 (validateUserOp OOG) errors.
    const MIN_VERIFICATION_GAS = 500_000n;
    const estimatedVerification = applyBuffer(gasEstimate.verificationGasLimit);
    userOp.verificationGasLimit = estimatedVerification < MIN_VERIFICATION_GAS
      ? MIN_VERIFICATION_GAS
      : estimatedVerification;

    if (gasEstimate.paymasterVerificationGasLimit) {
      userOp.paymasterVerificationGasLimit = applyBuffer(gasEstimate.paymasterVerificationGasLimit);
    }
    if (gasEstimate.paymasterPostOpGasLimit) {
      userOp.paymasterPostOpGasLimit = applyBuffer(gasEstimate.paymasterPostOpGasLimit);
    }
  } catch (e) {
    // Re-throw paymaster rejections so callers can fall back to self-funded.
    const msg = e.message || '';
    if (msg.includes('AA31') || msg.includes('AA33')
        || msg.includes('paymaster') || msg.includes('Paymaster')
        || msg.includes('validatePaymasterUserOp')) {
      throw e;
    }
    console.warn('Gas estimation failed, using generous defaults:', msg);
  }
}

/**
 * Compute the UserOp hash per EIP-4337 v0.7 (PackedUserOperation) spec.
 *
 * hash = keccak256(abi.encode(
 *   keccak256(pack(userOp)),  // without signature
 *   entryPoint,
 *   chainId
 * ))
 *
 * For v0.7 PackedUserOperation:
 *   pack = abi.encode(sender, nonce, hashInitCode, hashCallData,
 *          accountGasLimits, preVerificationGas, gasFees, hashPaymasterAndData)
 */
export function getUserOpHash(userOp, entryPoint, chainId) {
  // Reconstruct initCode from factory + factoryData
  let initCode = '0x';
  if (userOp.factory && userOp.factoryData) {
    initCode = concat([userOp.factory, userOp.factoryData]);
  }

  // Reconstruct paymasterAndData
  let paymasterAndData = '0x';
  if (userOp.paymaster) {
    const pmVerGas = pad(toHex(userOp.paymasterVerificationGasLimit || 0n), { size: 16 });
    const pmPostGas = pad(toHex(userOp.paymasterPostOpGasLimit || 0n), { size: 16 });
    if (userOp.paymasterData && userOp.paymasterData !== '0x') {
      paymasterAndData = concat([userOp.paymaster, pmVerGas, pmPostGas, userOp.paymasterData]);
    } else {
      paymasterAndData = concat([userOp.paymaster, pmVerGas, pmPostGas]);
    }
  }

  // Pack gas fields into bytes32 per v0.7 format
  const accountGasLimits = packUint128Pair(
    userOp.verificationGasLimit,
    userOp.callGasLimit,
  );
  const gasFees = packUint128Pair(
    userOp.maxPriorityFeePerGas,
    userOp.maxFeePerGas,
  );

  const packed = encodeAbiParameters(
    parseAbiParameters('address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32'),
    [
      userOp.sender,
      userOp.nonce,
      keccak256(initCode || '0x'),
      keccak256(userOp.callData),
      accountGasLimits,
      userOp.preVerificationGas,
      gasFees,
      keccak256(paymasterAndData || '0x'),
    ]
  );

  const userOpPacked = keccak256(packed);

  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint256'),
      [userOpPacked, entryPoint, BigInt(chainId)]
    )
  );
}

/**
 * Pack two uint128 values into a single bytes32.
 * high128 || low128
 */
function packUint128Pair(high, low) {
  return pad(toHex((BigInt(high) << 128n) | BigInt(low)), { size: 32 });
}

/**
 * Apply gas buffer percentage to an estimate.
 */
function applyBuffer(value) {
  return (BigInt(value) * (100n + GAS_BUFFER_PERCENT)) / 100n;
}

/**
 * Dummy signature for gas estimation.
 * Must be approximately the same length as a real passkey signature
 * so gas estimation accounts for signature verification cost.
 * A real signature is ~640 bytes (ABI-encoded credentialId + WebAuthnAuth).
 */
const DUMMY_SIGNATURE = '0x' + 'ff'.repeat(640);
