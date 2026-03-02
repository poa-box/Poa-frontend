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

  // 1. Get the nonce from EntryPoint
  const nonce = await publicClient.readContract({
    address: entryPoint,
    abi: entryPoint07Abi,
    functionName: 'getNonce',
    args: [sender, 0n],
  });

  // For EntryPoint v0.7, the UserOp uses "packed" format:
  // factory + factoryData instead of initCode
  // paymaster + paymasterVerificationGasLimit + paymasterPostOpGasLimit + paymasterData
  // accountGasLimits = verificationGasLimit(uint128) || callGasLimit(uint128)
  // gasFees = maxPriorityFeePerGas(uint128) || maxFeePerGas(uint128)

  // Parse initCode into factory + factoryData (v0.7 format)
  let factory = undefined;
  let factoryData = undefined;
  if (initCode && initCode !== '0x' && initCode.length > 2) {
    factory = '0x' + initCode.slice(2, 42); // First 20 bytes = factory address
    factoryData = '0x' + initCode.slice(42);  // Rest = factoryData
  }

  // 3. Build initial UserOp with placeholder gas values and a dummy signature for estimation
  const userOp = {
    sender,
    nonce,
    factory,
    factoryData,
    callData,
    callGasLimit: 500_000n,
    verificationGasLimit: 500_000n,
    preVerificationGas: 100_000n,
    maxFeePerGas: 3_000_000_000n,       // 3 gwei placeholder
    maxPriorityFeePerGas: 1_500_000_000n, // 1.5 gwei placeholder
    paymaster: paymasterAddress,
    paymasterVerificationGasLimit: 200_000n,
    paymasterPostOpGasLimit: 100_000n,
    paymasterData,
    signature: DUMMY_SIGNATURE,
  };

  // 4. Get current gas prices from the Pimlico bundler
  try {
    const gasPrices = await bundlerClient.getUserOperationGasPrice();
    userOp.maxFeePerGas = gasPrices.standard.maxFeePerGas;
    userOp.maxPriorityFeePerGas = gasPrices.standard.maxPriorityFeePerGas;
  } catch (e) {
    console.warn('Failed to get gas price from bundler, using defaults:', e.message);
  }

  // 5. Estimate gas via the bundler's eth_estimateUserOperationGas
  try {
    const gasEstimate = await bundlerClient.estimateUserOperationGas({
      userOperation: userOp,
      entryPointAddress: ENTRY_POINT_ADDRESS,
    });

    userOp.callGasLimit = applyBuffer(gasEstimate.callGasLimit);
    userOp.verificationGasLimit = applyBuffer(gasEstimate.verificationGasLimit);
    userOp.preVerificationGas = applyBuffer(gasEstimate.preVerificationGas);

    if (gasEstimate.paymasterVerificationGasLimit) {
      userOp.paymasterVerificationGasLimit = applyBuffer(gasEstimate.paymasterVerificationGasLimit);
    }
    if (gasEstimate.paymasterPostOpGasLimit) {
      userOp.paymasterPostOpGasLimit = applyBuffer(gasEstimate.paymasterPostOpGasLimit);
    }
  } catch (e) {
    console.warn('Gas estimation failed, using generous defaults:', e.message);
    // Keep the generous placeholder values
  }

  return userOp;
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
