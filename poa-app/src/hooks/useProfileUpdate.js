/**
 * useProfileUpdate
 * Hook for updating user profile metadata on the UniversalAccountRegistry.
 * Handles both EOA (direct contract call) and passkey (ERC-4337 UserOp) flows.
 * Profile updates are sponsored via the solidarity onboarding path.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@apollo/client';
import { encodeFunctionData } from 'viem';
import { useAuth } from '@/context/AuthContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { useEthersSigner } from '@/components/ProviderConverter';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS } from '@/util/passkeyQueries';
import { ipfsCidToBytes32 } from '@/services/web3/utils/encoding';
import { buildUserOp, getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { signUserOpWithPasskey } from '@/services/web3/passkey/passkeySign';
import { encodeSolidarityOnboardingPaymasterData } from '@/services/web3/passkey/paymasterData';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { DEFAULT_CHAIN_ID } from '@/config/networks';
import UniversalAccountRegistryABI from '../../abi/UniversalAccountRegistry.json';
import PasskeyAccountABI from '../../abi/PasskeyAccount.json';
import { ethers } from 'ethers';

export function useProfileUpdate() {
  const { isPasskeyUser, accountAddress, passkeyState, publicClient, bundlerClient } = useAuth();
  const { addToIpfs } = useIPFScontext();
  const signer = useEthersSigner();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('idle');

  // Fetch infrastructure addresses
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES);
  const paymasterAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;

  // Fetch factory address (needed for passkey users)
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, {
    skip: !isPasskeyUser,
  });
  const factoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  /**
   * Update profile metadata.
   * @param {Object} profileData - { bio, avatar, github, twitter, website }
   * @returns {Promise<string>} Transaction hash
   */
  const updateProfile = useCallback(async (profileData) => {
    if (!accountAddress || !registryAddress) {
      throw new Error('Account or registry not available');
    }

    setIsUpdating(true);
    setError(null);

    try {
      // Step 1: Upload metadata JSON to IPFS
      setStep('uploading');
      const jsonContent = JSON.stringify(profileData);
      const ipfsResult = await addToIpfs(jsonContent);
      const cid = ipfsResult.path;

      // Step 2: Convert CID to bytes32
      const metadataHash = ipfsCidToBytes32(cid);

      let txHash;

      if (isPasskeyUser) {
        // Passkey flow: build UserOp with solidarity onboarding sponsorship
        txHash = await _updateViaPasskey(metadataHash);
      } else {
        // EOA flow: direct contract call
        txHash = await _updateViaEOA(metadataHash);
      }

      setStep('success');
      return txHash;
    } catch (err) {
      console.error('[ProfileUpdate] Error:', err);
      setError(err);
      setStep('error');
      throw err;
    } finally {
      setIsUpdating(false);
    }
  }, [accountAddress, registryAddress, isPasskeyUser, addToIpfs, signer, publicClient, bundlerClient, paymasterAddress, passkeyState, factoryAddress]);

  /**
   * EOA flow: direct contract write using ethers signer.
   */
  async function _updateViaEOA(metadataHash) {
    if (!signer) throw new Error('Wallet not connected');

    setStep('signing');
    const contract = new ethers.Contract(registryAddress, UniversalAccountRegistryABI, signer);
    const tx = await contract.setProfileMetadata(metadataHash);

    setStep('confirming');
    const receipt = await tx.wait();
    return receipt.transactionHash;
  }

  /**
   * Passkey flow: build UserOp with execute(registry, 0, setProfileMetadata(hash))
   * sponsored via solidarity onboarding path.
   */
  async function _updateViaPasskey(metadataHash) {
    if (!bundlerClient || !publicClient || !paymasterAddress) {
      throw new Error('Passkey infrastructure not available');
    }

    setStep('building');

    // Encode setProfileMetadata(bytes32) call
    const innerCallData = encodeFunctionData({
      abi: UniversalAccountRegistryABI,
      functionName: 'setProfileMetadata',
      args: [metadataHash],
    });

    // Wrap in execute(registryAddress, 0, innerCallData)
    const callData = encodeFunctionData({
      abi: PasskeyAccountABI,
      functionName: 'execute',
      args: [registryAddress, 0n, innerCallData],
    });

    // Use solidarity onboarding paymaster data (profile updates go through onboarding path)
    const paymasterData = encodeSolidarityOnboardingPaymasterData();

    const userOp = await buildUserOp({
      sender: accountAddress,
      callData,
      bundlerClient,
      publicClient,
      paymasterAddress,
      paymasterData,
    });

    // Sign UserOp with passkey
    setStep('signing');
    const userOpHash = getUserOpHash(
      userOp,
      ENTRY_POINT_ADDRESS,
      DEFAULT_CHAIN_ID,
    );
    const signature = await signUserOpWithPasskey(userOpHash, passkeyState.rawCredentialId);
    userOp.signature = signature;

    // Submit to bundler
    setStep('submitting');
    const submittedHash = await bundlerClient.sendUserOperation({
      ...userOp,
      entryPointAddress: ENTRY_POINT_ADDRESS,
    });

    // Wait for receipt
    setStep('confirming');
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: submittedHash,
      timeout: 120_000,
    });

    if (!receipt.success) {
      throw new Error(receipt.reason || 'Profile update UserOp failed on-chain');
    }

    return receipt.receipt.transactionHash;
  }

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setIsUpdating(false);
  }, []);

  return {
    updateProfile,
    isUpdating,
    error,
    step,
    reset,
  };
}

export default useProfileUpdate;
