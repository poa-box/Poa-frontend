/**
 * useProfileUpdate
 * Hook for updating user profile metadata on the UniversalAccountRegistry.
 * Handles both EOA (direct contract call) and passkey (ERC-4337 UserOp) flows.
 *
 * Passkey profile updates are sponsored via solidarity onboarding on GNOSIS chain
 * (Arbitrum does not have onboarding enabled).
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { encodeFunctionData } from 'viem';
import { useAuth } from '@/context/AuthContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { useEthersSigner, clientToSigner } from '@/components/ProviderConverter';
import { useSwitchChain, useConfig } from 'wagmi';
import { getConnectorClient } from 'wagmi/actions';
import { useWalletClient } from 'wagmi';
import { ipfsCidToBytes32 } from '@/services/web3/utils/encoding';
import { buildUserOp, getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { signUserOpWithPasskey } from '@/services/web3/passkey/passkeySign';
import { encodeSolidarityOnboardingPaymasterData } from '@/services/web3/passkey/paymasterData';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { signUserOpWithWallet } from '@/services/web3/eip7702/walletSigner';
import { buildEOAAuthorization, checkWallet7702Support } from '@/services/web3/eip7702/authorizationBuilder';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { DEFAULT_DEPLOY_CHAIN_ID, getSubgraphUrl } from '@/config/networks';
import UniversalAccountRegistryABI from '../../abi/UniversalAccountRegistry.json';
import PasskeyAccountABI from '../../abi/PasskeyAccount.json';
import { ethers } from 'ethers';

// Solidarity-funded operations target Gnosis (onboarding enabled there, not Arbitrum)
const SOLIDARITY_CHAIN_ID = DEFAULT_DEPLOY_CHAIN_ID;

export function useProfileUpdate() {
  const { isPasskeyUser, accountAddress, passkeyState } = useAuth();
  const { addToIpfs } = useIPFScontext();
  const signer = useEthersSigner();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const { data: walletClient } = useWalletClient();

  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('idle');

  // Gnosis-specific clients for passkey UserOps
  const gnosisClients = useMemo(() => createChainClients(SOLIDARITY_CHAIN_ID), []);
  const publicClient = gnosisClients?.publicClient;
  const bundlerClient = gnosisClients?.bundlerClient;

  // Infrastructure state (fetched from Gnosis subgraph)
  const [paymasterAddress, setPaymasterAddress] = useState(null);
  const [registryAddress, setRegistryAddress] = useState(null);

  useEffect(() => {
    const subgraphUrl = getSubgraphUrl(SOLIDARITY_CHAIN_ID);
    if (!subgraphUrl) return;

    async function fetchInfra() {
      try {
        const query = `{
          poaManagerContracts(first: 1) { paymasterHubProxy }
          universalAccountRegistries(first: 1) { id }
        }`;
        const res = await fetch(subgraphUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const json = await res.json();
        const data = json?.data;
        setPaymasterAddress(data?.poaManagerContracts?.[0]?.paymasterHubProxy || null);
        setRegistryAddress(data?.universalAccountRegistries?.[0]?.id || null);
      } catch (err) {
        console.error('[ProfileUpdate] Failed to fetch Gnosis infrastructure:', err);
      }
    }

    fetchInfra();
  }, []);

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
  }, [accountAddress, registryAddress, isPasskeyUser, addToIpfs, signer, publicClient, bundlerClient, paymasterAddress, passkeyState]);

  /**
   * EOA flow: try 7702 gas-sponsored via solidarity fund, fallback to direct tx.
   * Profile metadata lives on Gnosis, so we target the Gnosis chain.
   */
  async function _updateViaEOA(metadataHash) {
    if (!signer) throw new Error('Wallet not connected');

    // Try 7702 sponsored path first (same solidarity fund as passkey users)
    if (walletClient && bundlerClient && publicClient && paymasterAddress) {
      const has7702 = await checkWallet7702Support(walletClient).catch(() => false);
      if (has7702) {
        try {
          return await _updateVia7702(metadataHash);
        } catch (err) {
          console.warn('[ProfileUpdate] 7702 sponsored path failed, falling back to direct tx:', err.message);
        }
      }
    }

    // Fallback: direct contract call (EOA pays gas on Gnosis)
    setStep('signing');
    await switchChainAsync({ chainId: SOLIDARITY_CHAIN_ID });
    const freshClient = await getConnectorClient(wagmiConfig, { chainId: SOLIDARITY_CHAIN_ID });
    const gnosisSigner = clientToSigner(freshClient);

    const contract = new ethers.Contract(registryAddress, UniversalAccountRegistryABI, gnosisSigner);
    const tx = await contract.setProfileMetadata(metadataHash);

    setStep('confirming');
    const receipt = await tx.wait();
    return receipt.transactionHash;
  }

  /**
   * EOA 7702 path: build UserOp with solidarity onboarding sponsorship.
   * Same flow as passkey but signs with wallet ECDSA instead of WebAuthn.
   */
  async function _updateVia7702(metadataHash) {
    setStep('building');

    const authorization = await buildEOAAuthorization(walletClient);

    const innerCallData = encodeFunctionData({
      abi: UniversalAccountRegistryABI,
      functionName: 'setProfileMetadata',
      args: [metadataHash],
    });

    const callData = encodeFunctionData({
      abi: PasskeyAccountABI,
      functionName: 'execute',
      args: [registryAddress, 0n, innerCallData],
    });

    const paymasterData = encodeSolidarityOnboardingPaymasterData();

    const userOp = await buildUserOp({
      sender: accountAddress,
      callData,
      bundlerClient,
      publicClient,
      paymasterAddress,
      paymasterData,
      authorization,
      dummySignatureLength: 65,
    });

    setStep('signing');
    const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, SOLIDARITY_CHAIN_ID);
    const signature = await signUserOpWithWallet(userOpHash, walletClient);
    userOp.signature = signature;

    setStep('submitting');
    const submittedHash = await bundlerClient.sendUserOperation({
      ...userOp,
      entryPointAddress: ENTRY_POINT_ADDRESS,
    });

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
      SOLIDARITY_CHAIN_ID,
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
