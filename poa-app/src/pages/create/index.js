import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Box,
  useToast,
  Button,
  Text,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useBreakpointValue,
} from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { useQuery } from "@apollo/client";
import LogoDropzoneModal from "@/components/Architect/LogoDropzoneModal";
import LinksModal from "@/components/Architect/LinksModal";
import { useAccount, useDisconnect, useSwitchChain, useConfig } from "wagmi";
import { getConnectorClient } from "wagmi/actions";
import { useEthersSigner, clientToSigner } from "@/components/ProviderConverter";
import { useAuth } from "@/context/AuthContext";
import { useIPFScontext } from "@/context/ipfsContext";
import { main, buildDeployCalldata } from "../../../scripts/newDeployment";
import { useRouter } from "next/router";
import { FETCH_INFRASTRUCTURE_ADDRESSES, FETCH_USERNAME_NEW } from "@/util/queries";
import { ipfsCidToBytes32 } from "@/services/web3/utils/encoding";
import { signRegistration, getSkipRegistrationDefaults } from "@/services/web3/utils/registrySigner";
import { ethers } from 'ethers';

// New deployer imports
import {
  DeployerProvider,
  useDeployer,
  DeployerWizard,
  mapStateToDeploymentParams,
  mapPaymasterConfig,
  getPaymasterFundingValue,
} from "@/features/deployer";
import { resolveRoleUsernames } from "@/features/deployer/utils/usernameResolver";

// Passkey deployment via ERC-4337 UserOp
import { encodeFunctionData, createPublicClient, http, defineChain } from "viem";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import PasskeyAccountABI from "../../../abi/PasskeyAccount.json";
import PasskeyAccountFactoryABI from "../../../abi/PasskeyAccountFactory.json";
import UniversalAccountRegistryABI from "../../../abi/UniversalAccountRegistry.json";
import { buildUserOp, getUserOpHash } from "@/services/web3/passkey/userOpBuilder";
import { signUserOpWithPasskey } from "@/services/web3/passkey/passkeySign";
import { encodeOrgDeployPaymasterData } from "@/services/web3/passkey/paymasterData";
import { getBundlerUrl, ENTRY_POINT_ADDRESS } from "@/config/passkey";
import { DEFAULT_DEPLOY_CHAIN_ID, getNetworkByChainId, getSubgraphUrl } from "@/config/networks";
import { FETCH_PASSKEY_FACTORY_ADDRESS } from "@/util/passkeyQueries";

/**
 * Inner component that has access to DeployerContext
 */
function DeployerPageContent() {
  const { address, status, chainId: connectedChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { passkeyState } = useAuth();
  const signer = useEthersSigner();
  const wagmiConfig = useConfig();

  const { disconnect } = useDisconnect();

  // Clear any auto-reconnected wallet so users must explicitly choose auth method.
  // Passkey sessions are unaffected (managed separately in AuthContext).
  // Uses a ref so we only disconnect once (the first auto-reconnect), not after user-initiated connects.
  const hasDisconnectedAutoReconnect = useRef(false);
  const [walletUserConnected, setWalletUserConnected] = useState(false);
  const isPasskeyUser = !!passkeyState?.accountAddress;

  useEffect(() => {
    if (!hasDisconnectedAutoReconnect.current && (status === 'reconnecting' || status === 'connected')) {
      hasDisconnectedAutoReconnect.current = true;
      // Only force auth choice when the user has a passkey — wallet-only users
      // shouldn't be disconnected because re-triggering connect can stall
      // in some wallet extensions (e.g. Brave) that consider the dapp already authorized.
      if (isPasskeyUser) {
        disconnect();
      } else {
        setWalletUserConnected(true);
      }
    }
  }, [status, disconnect, isPasskeyUser]);
  useEffect(() => {
    if (status === 'connecting') setWalletUserConnected(true);
    if (status === 'disconnected') setWalletUserConnected(false);
  }, [status]);
  const { addToIpfs } = useIPFScontext();
  const toast = useToast();
  const router = useRouter();
  const { state, actions } = useDeployer();

  // Fetch infrastructure addresses from the target deploy chain's subgraph
  const deployChainId = state.selectedChainId || DEFAULT_DEPLOY_CHAIN_ID;
  const deploySubgraphUrl = getSubgraphUrl(deployChainId);
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    fetchPolicy: 'network-only',
    context: { subgraphUrl: deploySubgraphUrl },
    skip: !deploySubgraphUrl,
  });

  // Fetch passkey factory address on deploy chain (needed for cross-chain account creation)
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, {
    fetchPolicy: 'network-only',
    context: { subgraphUrl: deploySubgraphUrl },
    skip: !deploySubgraphUrl || !isPasskeyUser,
  });
  const deployChainFactoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  // Check if deployer already has a username on the deploy chain (via subgraph)
  // IMPORTANT: Use 'no-cache' to prevent Apollo from returning cached Arbitrum results
  // for the same account ID queried against the Gnosis subgraph endpoint.
  const deployerAddr = passkeyState?.accountAddress || address;
  const { data: deployChainAccountData } = useQuery(FETCH_USERNAME_NEW, {
    variables: { id: deployerAddr?.toLowerCase() },
    fetchPolicy: 'no-cache',
    context: { subgraphUrl: deploySubgraphUrl },
    skip: !deployerAddr || !deploySubgraphUrl,
  });
  const deployChainHasUsername = !!deployChainAccountData?.account?.username;

  // Extract addresses from subgraph data
  const infrastructureAddresses = useMemo(() => {
    const poaManager = infraData?.poaManagerContracts?.[0];

    // Infrastructure PROXY addresses (from PoaManager - these are what you actually call)
    const orgDeployerAddress = poaManager?.orgDeployerProxy || null;
    const orgRegistryProxy = poaManager?.orgRegistryProxy || null;
    const paymasterHubProxy = poaManager?.paymasterHubProxy || null;
    const globalAccountRegistryProxy = poaManager?.globalAccountRegistryProxy || null;

    // Use globalAccountRegistryProxy as registryAddress (this is the UniversalAccountRegistry)
    const registryAddress = globalAccountRegistryProxy;
    const poaManagerAddress = poaManager?.id || null;
    const orgRegistryAddress = orgRegistryProxy;

    return {
      registryAddress,
      poaManagerAddress,
      orgRegistryAddress,
      orgDeployerAddress,
      orgRegistryProxy,
      paymasterHubProxy,
      globalAccountRegistryProxy,
    };
  }, [infraData]);

  // Modal states
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  // Responsive values
  const exitButtonTop = useBreakpointValue({ base: "8px", lg: "8px", xl: "12px" });
  const exitButtonRight = useBreakpointValue({ base: "10px", lg: "16px", xl: "25px" });
  const exitButtonSize = useBreakpointValue({ base: "md", lg: "md", xl: "lg" });

  const handleExitClick = () => {
    setIsExitModalOpen(true);
  };

  const handleExitConfirm = () => {
    setIsExitModalOpen(false);
    router.push("/");
  };

  const handleExitCancel = () => {
    setIsExitModalOpen(false);
  };

  // Handle deployment from DeployerWizard
  const handleDeployStart = async (config) => {
    setIsDeploying(true);

    // Passkey deploys use chain-specific viem/bundler clients — they never
    // touch the wallet provider, so we skip chain switching and signer refresh.
    const targetChainId = state.selectedChainId || DEFAULT_DEPLOY_CHAIN_ID;
    const isPasskeyDeployer = !!passkeyState?.accountAddress;
    const needsChainSwitch = !isPasskeyDeployer && connectedChainId && connectedChainId !== targetChainId;

    if (needsChainSwitch) {
      try {
        await switchChainAsync({ chainId: targetChainId });
      } catch (e) {
        const networkName = getNetworkByChainId(targetChainId)?.name || 'the correct network';
        toast({
          title: 'Chain switch required',
          description: `Please switch to ${networkName} to deploy.`,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        setIsDeploying(false);
        return;
      }
    }

    // After a chain switch the signer from useEthersSigner() is stale (captured
    // at render time with the old chain's transport/network). Fetch a fresh
    // connector client for the target chain so RPC calls and signatures use the
    // correct chain.
    let deploySigner = signer;
    if (needsChainSwitch) {
      try {
        const freshClient = await getConnectorClient(wagmiConfig, { chainId: targetChainId });
        deploySigner = clientToSigner(freshClient);
        console.log('[DEPLOY] Got fresh signer for target chain', targetChainId);
      } catch (e) {
        console.warn('[DEPLOY] Could not get fresh signer, using hook signer:', e.message);
      }
    }

    // Extract deployer username from config (validated by ReviewStep)
    const deployerUsername = config?.deployerUsername || state.organization.username || '';
    console.log('[DEPLOY] Using deployer username:', deployerUsername);

    try {
      // Resolve all usernames to addresses before deployment
      const rolesWithResolvedAddresses = await resolveRoleUsernames(state.roles);

      // Upload description and links to IPFS first
      const links = state.organization.links || [];
      const jsonData = {
        description: state.organization.description || '',
        links: links.map((link) => ({
          name: link.name,
          url: link.url,
        })),
        template: state.organization.template || 'default',
        logo: state.organization.logoURL || null,
      };

      console.log('[DEPLOY] Preparing IPFS metadata:', jsonData);

      let infoIPFSHash = state.organization.infoIPFSHash;
      if (!infoIPFSHash) {
        console.log('[DEPLOY] No existing IPFS hash, uploading new metadata...');
        const result = await addToIpfs(JSON.stringify(jsonData));
        infoIPFSHash = result.path;
        console.log('[DEPLOY] IPFS upload complete. CID:', infoIPFSHash);
        console.log('[DEPLOY] Verify content at: https://api.thegraph.com/ipfs/api/v0/cat?arg=' + infoIPFSHash);
        actions.setIPFSHash(infoIPFSHash);
      } else {
        console.log('[DEPLOY] Using existing IPFS hash:', infoIPFSHash);
      }

      console.log('[DEPLOY] Final infoIPFSHash for deployment:', infoIPFSHash);

      // Upload role metadata to IPFS for roles with descriptions
      // Note: Role names are stored on-chain and indexed directly, not via IPFS
      console.log('[DEPLOY] Uploading role metadata to IPFS...');
      const rolesWithMetadata = await Promise.all(
        rolesWithResolvedAddresses.map(async (role) => {
          // Only upload metadata if role has a description
          if (role.description && role.description.trim()) {
            const roleMetadata = {
              description: role.description,
              image: role.image || '',
            };
            console.log(`[DEPLOY] Uploading metadata for role "${role.name}":`, roleMetadata);

            try {
              const result = await addToIpfs(JSON.stringify(roleMetadata));
              const metadataCID = result.path;
              console.log(`[DEPLOY] Role "${role.name}" metadata CID:`, metadataCID);

              // Convert IPFS CID to bytes32 for the smart contract
              const metadataCIDBytes32 = ipfsCidToBytes32(metadataCID);
              console.log(`[DEPLOY] Role "${role.name}" metadataCID (bytes32):`, metadataCIDBytes32);

              return {
                ...role,
                metadataCID: metadataCIDBytes32,
              };
            } catch (error) {
              console.error(`[DEPLOY] Failed to upload metadata for role "${role.name}":`, error);
              // Continue without metadata if upload fails
              return role;
            }
          }
          return role;
        })
      );

      // Get deployment params with resolved addresses and metadata
      const stateWithResolvedRoles = {
        ...state,
        roles: rolesWithMetadata,
      };

      console.log('=== DEPLOYMENT DEBUG ===');
      console.log('Infrastructure addresses:', infrastructureAddresses);

      const deployParams = mapStateToDeploymentParams(stateWithResolvedRoles, address, infrastructureAddresses);

      console.log('Deployment params:', deployParams);

      // Check if any role has custom distribution settings (additionalWearers or mintToDeployer)
      const hasCustomDistribution = deployParams.roles.some(
        role =>
          (role.distribution.additionalWearers && role.distribution.additionalWearers.length > 0) ||
          role.distribution.mintToDeployer
      );
      console.log('Has custom distribution:', hasCustomDistribution);

      console.log('Roles structure:');
      deployParams.roles.forEach((role, idx) => {
        console.log(`  Role [${idx}] ${role.name}:`, {
          canVote: role.canVote,
          vouching: role.vouching,
          defaults: role.defaults,
          hierarchy: {
            adminRoleIndex: role.hierarchy.adminRoleIndex?.toString?.() || role.hierarchy.adminRoleIndex
          },
          distribution: {
            mintToDeployer: role.distribution.mintToDeployer,
            additionalWearers: role.distribution.additionalWearers,
          },
          hatConfig: role.hatConfig,
        });
      });

      // === EIP-712 Registration Signature (EOA only) ===
      // The deploy contract's HatsTreeSetup calls registerAccountBySig atomically.
      // It checks: registryAddr != 0 && username.length > 0 && regSignature.length > 0
      // and is idempotent (skips if user already has a username on-chain).
      // We use the subgraph to avoid signing when the user already has a username,
      // and a public RPC provider for on-chain reads (nonce, block) so they work
      // reliably after a chain switch.
      let regSignatureData = getSkipRegistrationDefaults();
      const hasNewUsername = deployerUsername && deployerUsername.trim().length > 0;

      if (!isPasskeyDeployer && deploySigner && hasNewUsername && !deployChainHasUsername) {
        const registryAddress = infrastructureAddresses.registryAddress;
        if (registryAddress) {
          try {
            toast({
              title: 'Signature Required',
              description: 'Please sign the message in your wallet to register your username.',
              status: 'info',
              duration: 5000,
              isClosable: true,
            });

            // Use a public RPC provider for reads — the wallet provider can be stale
            // after switchChainAsync (transport/network metadata not yet updated).
            const targetNetwork = getNetworkByChainId(targetChainId);
            const readProvider = new ethers.providers.JsonRpcProvider(
              targetNetwork.rpcUrl,
              { chainId: targetChainId, name: targetNetwork.name }
            );

            const sigResult = await signRegistration({
              signer: deploySigner,
              registryAddress,
              username: deployerUsername,
              deadlineSeconds: 300,
              chainId: targetChainId,
              readProvider,
            });

            regSignatureData = {
              regDeadline: sigResult.deadline,
              regNonce: sigResult.nonce,
              regSignature: sigResult.signature,
            };

            console.log('[DEPLOY] EIP-712 signature obtained:', {
              deadline: sigResult.deadline.toString(),
              nonce: sigResult.nonce.toString(),
              signatureLength: sigResult.signature.length,
            });
          } catch (sigError) {
            if (sigError.code === 4001 || sigError.code === 'ACTION_REJECTED') {
              throw new Error('Username registration signature was rejected. Deployment cancelled.');
            }
            // Retry once after a brief delay — chain switch may not have fully propagated
            console.warn('[DEPLOY] EIP-712 signing failed, retrying after delay...', sigError.message);
            try {
              await new Promise(r => setTimeout(r, 2000));
              // Re-fetch fresh signer in case the first one was stale
              const retryClient = await getConnectorClient(wagmiConfig, { chainId: targetChainId });
              const retrySigner = clientToSigner(retryClient);
              const sigResult = await signRegistration({
                signer: retrySigner,
                registryAddress,
                username: deployerUsername,
                deadlineSeconds: 300,
                chainId: targetChainId,
                readProvider,
              });
              regSignatureData = {
                regDeadline: sigResult.deadline,
                regNonce: sigResult.nonce,
                regSignature: sigResult.signature,
              };
              console.log('[DEPLOY] EIP-712 signature obtained on retry');
            } catch (retryError) {
              if (retryError.code === 4001 || retryError.code === 'ACTION_REJECTED') {
                throw new Error('Username registration signature was rejected. Deployment cancelled.');
              }
              console.error('[DEPLOY] EIP-712 signing failed on retry, deploying without registration:', retryError);
              toast({
                title: 'Username registration skipped',
                description: 'Could not prepare the username signature. Your org will deploy without on-chain username registration. You can register your username later.',
                status: 'warning',
                duration: 8000,
                isClosable: true,
              });
            }
          }
        }
      } else if (!isPasskeyDeployer) {
        console.log('[DEPLOY] Skipping EIP-712 signing:', {
          hasSigner: !!deploySigner,
          hasNewUsername,
          deployChainHasUsername,
        });
      }

      // Call the deployment function
      const membershipTypeNames = state.roles.map(r => r.name);
      const executiveRoleNames = state.roles
        .filter(r => r.hierarchy.adminRoleIndex === null)
        .map(r => r.name);

      const hasQuadratic = state.voting.classes.some(c => c.quadratic);
      const hybridVotingEnabled = state.voting.classes.length > 1;

      // Pass customRoles if there are any custom distribution settings
      // This ensures mintToDeployer and additionalWearers settings are respected
      const customRoles = hasCustomDistribution ? deployParams.roles : null;

      // Paymaster config
      const paymasterConfig = mapPaymasterConfig(state.paymaster);
      const paymasterFundingWei = getPaymasterFundingValue(state.paymaster);

      if (isPasskeyDeployer) {
        // === PASSKEY DEPLOYMENT via ERC-4337 UserOp ===
        const { calldata, orgDeployerAddress } = buildDeployCalldata({
          memberTypeNames: membershipTypeNames,
          executivePermissionNames: executiveRoleNames,
          POname: state.organization.name,
          quadraticVotingEnabled: hasQuadratic,
          democracyVoteWeight: 50,
          participationVoteWeight: 50,
          hybridVotingEnabled,
          participationVotingEnabled: !hybridVotingEnabled,
          electionEnabled: state.features.electionHubEnabled,
          educationHubEnabled: state.features.educationHubEnabled,
          infoIPFSHash,
          quorumPercentageDD: state.voting.ddQuorum,
          quorumPercentagePV: state.voting.hybridQuorum,
          username: deployerUsername,
          deployerAddress: passkeyState.accountAddress,
          customRoles,
          infrastructureAddresses,
          regSignatureData,
          paymasterConfig,
          metadataAdminRoleIndex: state.metadataAdminRoleIndex,
        });

        const fundingBigInt = paymasterFundingWei.gt(0) ? BigInt(paymasterFundingWei.toString()) : 0n;

        // Create chain-specific clients for deployment target.
        // AuthContext clients are pinned to the home chain for login/reconnect flows.
        const targetNetwork = getNetworkByChainId(targetChainId);
        const targetChain = defineChain({
          id: targetNetwork.chainId,
          name: targetNetwork.name,
          nativeCurrency: targetNetwork.nativeCurrency,
          rpcUrls: { default: { http: [targetNetwork.rpcUrl] } },
          blockExplorers: { default: { name: 'Explorer', url: targetNetwork.blockExplorer } },
        });
        const deployPublicClient = createPublicClient({
          chain: targetChain,
          transport: http(targetNetwork.rpcUrl),
        });
        const deployBundlerClient = createPimlicoClient({
          chain: targetChain,
          transport: http(getBundlerUrl(targetChainId)),
          entryPoint: { address: ENTRY_POINT_ADDRESS, version: '0.7' },
        });

        // --- Cross-chain account handling ---
        // Check if the passkey smart account exists on the target chain.
        // If not, include initCode so the EntryPoint deploys it via the factory.
        let initCode = '0x';
        const accountBytecode = await deployPublicClient.getBytecode({
          address: passkeyState.accountAddress,
        });
        const accountExistsOnTargetChain = accountBytecode && accountBytecode !== '0x';

        if (!accountExistsOnTargetChain) {
          if (!deployChainFactoryAddress) {
            throw new Error(
              `Passkey account factory not found on ${targetNetwork.name}. ` +
              `The protocol infrastructure may not be deployed on this chain yet.`
            );
          }

          // Verify the target chain's factory produces the same address as our home-chain account.
          // CREATE2 address depends on factory address, so if factories differ across chains
          // the account address would differ — causing AA14 (initCode must return sender).
          const targetAccountAddress = await deployPublicClient.readContract({
            address: deployChainFactoryAddress,
            abi: PasskeyAccountFactoryABI,
            functionName: 'getAddress',
            args: [
              passkeyState.credentialId,
              passkeyState.publicKeyX,
              passkeyState.publicKeyY,
              BigInt(passkeyState.salt),
            ],
          });

          if (targetAccountAddress.toLowerCase() !== passkeyState.accountAddress.toLowerCase()) {
            throw new Error(
              `Account address mismatch: home chain account is ${passkeyState.accountAddress} ` +
              `but ${targetNetwork.name} factory would create ${targetAccountAddress}. ` +
              `Cross-chain deployment is not supported for this configuration.`
            );
          }

          const factoryCallData = encodeFunctionData({
            abi: PasskeyAccountFactoryABI,
            functionName: 'createAccount',
            args: [
              passkeyState.credentialId,
              passkeyState.publicKeyX,
              passkeyState.publicKeyY,
              BigInt(passkeyState.salt),
            ],
          });
          initCode = deployChainFactoryAddress + factoryCallData.slice(2);
          console.log('[DEPLOY] Account not found on target chain — initCode will deploy it');
        }

        // Check if the deployer's username is registered on the target chain's registry.
        // The home chain (Arbitrum) has the username, but this chain's registry may not.
        let needsUsernameRegistration = false;
        const registryAddress = infrastructureAddresses.registryAddress;
        if (deployerUsername && registryAddress) {
          try {
            const existingName = await deployPublicClient.readContract({
              address: registryAddress,
              abi: UniversalAccountRegistryABI,
              functionName: 'getUsername',
              args: [passkeyState.accountAddress],
            });
            needsUsernameRegistration = !existingName || existingName.trim().length === 0;
            console.log('[DEPLOY] Username on target chain:', existingName || '(none)');
          } catch {
            // If account doesn't exist yet, getUsername will revert — treat as unregistered
            needsUsernameRegistration = true;
            console.log('[DEPLOY] Could not read username on target chain — will register');
          }
        }

        // Build the UserOp callData:
        // - If username needs registration: executeBatch([registerAccount, deployFullOrg])
        // - Otherwise: single execute(deployFullOrg) (existing behavior)
        let sponsoredCallData;
        let selfFundedCallData;

        if (needsUsernameRegistration && registryAddress) {
          const registerCallData = encodeFunctionData({
            abi: UniversalAccountRegistryABI,
            functionName: 'registerAccount',
            args: [deployerUsername],
          });

          sponsoredCallData = encodeFunctionData({
            abi: PasskeyAccountABI,
            functionName: 'executeBatch',
            args: [
              [registryAddress, orgDeployerAddress],
              [0n, 0n],
              [registerCallData, calldata],
            ],
          });

          selfFundedCallData = encodeFunctionData({
            abi: PasskeyAccountABI,
            functionName: 'executeBatch',
            args: [
              [registryAddress, orgDeployerAddress],
              [0n, fundingBigInt],
              [registerCallData, calldata],
            ],
          });

          console.log('[DEPLOY] Using executeBatch: registerAccount + deployFullOrg');
        } else {
          sponsoredCallData = encodeFunctionData({
            abi: PasskeyAccountABI,
            functionName: 'execute',
            args: [orgDeployerAddress, 0n, calldata],
          });

          selfFundedCallData = encodeFunctionData({
            abi: PasskeyAccountABI,
            functionName: 'execute',
            args: [orgDeployerAddress, fundingBigInt, calldata],
          });
        }

        // Try sponsored deployment first (solidarity fund pays gas via PaymasterHub),
        // then fall back to self-funded if sponsorship is unavailable.
        let userOp;
        const paymasterHubAddress = infrastructureAddresses.paymasterHubProxy;

        if (paymasterHubAddress) {
          try {
            userOp = await buildUserOp({
              sender: passkeyState.accountAddress,
              callData: sponsoredCallData,
              bundlerClient: deployBundlerClient,
              publicClient: deployPublicClient,
              initCode,
              paymasterAddress: paymasterHubAddress,
              paymasterData: encodeOrgDeployPaymasterData(),
            });

            console.log('[DEPLOY] UserOp built with gas sponsorship (solidarity fund)');
          } catch (e) {
            const msg = e.message || e.shortMessage || e.details || '';
            const isPaymasterRejection = msg.includes('AA31') || msg.includes('AA32') || msg.includes('AA33')
              || msg.includes('paymaster') || msg.includes('Paymaster')
              || msg.includes('validatePaymasterUserOp');

            if (isPaymasterRejection) {
              console.warn('[DEPLOY] Gas sponsorship unavailable, falling back to self-funded:', msg);
              userOp = null;
            } else {
              throw e;
            }
          }
        }

        if (!userOp) {
          // Self-funded: account pays gas, can include ETH for org paymaster funding
          userOp = await buildUserOp({
            sender: passkeyState.accountAddress,
            callData: selfFundedCallData,
            bundlerClient: deployBundlerClient,
            publicClient: deployPublicClient,
            initCode,
          });

          console.log('[DEPLOY] UserOp built self-funded (account pays gas)');
        }

        // Sign with passkey (triggers biometric prompt)
        toast({
          title: 'Passkey Signature Required',
          description: 'Please authenticate with your passkey to deploy.',
          status: 'info',
          duration: 5000,
          isClosable: true,
        });

        const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, targetChainId);
        const signature = await signUserOpWithPasskey(userOpHash, passkeyState.rawCredentialId);
        userOp.signature = signature;

        // Submit to target-chain bundler
        const opHash = await deployBundlerClient.sendUserOperation({
          ...userOp,
          entryPointAddress: ENTRY_POINT_ADDRESS,
        });

        console.log('[DEPLOY] UserOp submitted:', opHash);

        // Wait for confirmation on target chain
        const receipt = await deployBundlerClient.waitForUserOperationReceipt({
          hash: opHash,
          timeout: 120_000,
        });

        if (!receipt.success) {
          throw new Error('Deployment transaction failed on-chain.');
        }

        console.log('[DEPLOY] Passkey deployment confirmed:', receipt.receipt.transactionHash);
      } else {
        // === WALLET DEPLOYMENT via ethers signer ===
        await main(
          membershipTypeNames,
          executiveRoleNames,
          state.organization.name,
          hasQuadratic,
          50, // democracyVoteWeight
          50, // participationVoteWeight
          hybridVotingEnabled,
          !hybridVotingEnabled, // participationVotingEnabled
          state.features.electionHubEnabled,
          state.features.educationHubEnabled,
          state.organization.logoURL,
          infoIPFSHash,
          'DirectDemocracy', // votingControlType
          state.voting.ddQuorum,
          state.voting.hybridQuorum,
          deployerUsername,
          deploySigner,
          customRoles,
          infrastructureAddresses,
          regSignatureData,
          undefined, // overrideDeployerAddress
          paymasterConfig,
          paymasterFundingWei,
          state.metadataAdminRoleIndex
        );
      }

      // Return success - let DeployerWizard handle the celebration
      return { success: true, orgName: state.organization.name };

    } catch (error) {
      console.error("Error deploying organization:", error);
      toast({
        title: "Deployment failed",
        description: error.message || "There was an error during deployment.",
        status: "error",
        duration: 9000,
        isClosable: true,
      });
      throw error; // Re-throw so DeployerWizard knows it failed
    } finally {
      setIsDeploying(false);
    }
  };

  // Handle navigation after deployment celebration
  const handleDeploySuccess = () => {
    // Delay redirect to allow subgraph indexing
    setTimeout(() => {
      router.push(`/profileHub?userDAO=${encodeURIComponent(state.organization.name)}`);
    }, 2000);
  };

  // Handlers for modals that OrganizationStep needs
  const handleSaveLogo = (ipfsUrl) => {
    actions.setLogoURL(ipfsUrl);
    setIsLogoModalOpen(false);
  };

  const handleSaveLinks = (links) => {
    actions.updateOrganization({ links });
    setIsLinksModalOpen(false);
  };

  return (
    <Box height="100vh" overflow="hidden" position="relative">
      {/* Ambient morphing orbs - matching landing page */}
      <Box
        position="absolute"
        top="-8%"
        left="-6%"
        w={["250px", "350px", "450px"]}
        h={["250px", "350px", "450px"]}
        bg="#7DD3FC"
        opacity={0.15}
        filter="blur(80px)"
        pointerEvents="none"
        zIndex={0}
        sx={{
          animation: "createOrb1 20s ease-in-out infinite",
          "@keyframes createOrb1": {
            "0%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(0, 0) rotate(0deg)" },
            "33%": { borderRadius: "60% 40% 50% 50% / 40% 60% 40% 60%", transform: "translate(25px, 15px) rotate(60deg)" },
            "66%": { borderRadius: "50% 50% 40% 60% / 50% 40% 60% 50%", transform: "translate(-10px, 30px) rotate(120deg)" },
            "100%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(0, 0) rotate(0deg)" },
          },
        }}
      />
      <Box
        position="absolute"
        bottom="-5%"
        right="-4%"
        w={["200px", "300px", "400px"]}
        h={["200px", "300px", "400px"]}
        bg="#67E8F9"
        opacity={0.12}
        filter="blur(80px)"
        pointerEvents="none"
        zIndex={0}
        sx={{
          animation: "createOrb2 24s ease-in-out infinite",
          "@keyframes createOrb2": {
            "0%": { borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%", transform: "translate(0, 0) rotate(0deg)" },
            "33%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(-20px, 25px) rotate(-60deg)" },
            "66%": { borderRadius: "50% 40% 50% 60% / 40% 60% 50% 40%", transform: "translate(15px, -10px) rotate(-120deg)" },
            "100%": { borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%", transform: "translate(0, 0) rotate(0deg)" },
          },
        }}
      />


      {/* Exit Button */}
      <Box position="absolute" top={exitButtonTop} right={exitButtonRight} zIndex={10}>
        <IconButton
          onClick={handleExitClick}
          bg="warmGray.100"
          _hover={{ bg: "warmGray.200" }}
          aria-label="Exit"
          icon={<CloseIcon color="warmGray.600" />}
          size={exitButtonSize}
          isRound
        />
      </Box>

      {/* Full Width Deployer Wizard */}
      <Box
        width="100%"
        height="100%"
        overflowY="auto"
      >
        <DeployerWizard
          onDeployStart={handleDeployStart}
          onDeploySuccess={handleDeploySuccess}
          deployerAddress={passkeyState?.accountAddress || (walletUserConnected ? address : undefined)}
        />
      </Box>

      {/* Modals */}
      <LogoDropzoneModal
        isOpen={isLogoModalOpen}
        onSave={handleSaveLogo}
        onClose={() => setIsLogoModalOpen(false)}
      />
      <LinksModal
        isOpen={isLinksModalOpen}
        onSave={handleSaveLinks}
        onClose={() => setIsLinksModalOpen(false)}
      />

      {/* Exit Confirmation Modal */}
      <Modal isOpen={isExitModalOpen} onClose={handleExitCancel}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Are you sure?</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            All progress will be lost. Do you really want to stop creating your organization?
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="red" mr={3} onClick={handleExitConfirm}>
              Yes, Exit
            </Button>
            <Button variant="ghost" onClick={handleExitCancel}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Deployment overlay is now handled by ReviewStep for a better UX */}
    </Box>
  );
}

/**
 * Main page component that wraps content with DeployerProvider
 */
const ArchitectPage = () => {
  return (
    <DeployerProvider>
      <DeployerPageContent />
    </DeployerProvider>
  );
};

export default ArchitectPage;
