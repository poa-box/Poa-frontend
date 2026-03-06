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
import { useAccount, useDisconnect } from "wagmi";
import { useEthersSigner } from "@/components/ProviderConverter";
import { useAuth } from "@/context/AuthContext";
import { useIPFScontext } from "@/context/ipfsContext";
import { main, buildDeployCalldata } from "../../../scripts/newDeployment";
import { useRouter } from "next/router";
import { FETCH_INFRASTRUCTURE_ADDRESSES } from "@/util/queries";
import { ipfsCidToBytes32 } from "@/services/web3/utils/encoding";
import { signRegistration, getSkipRegistrationDefaults, fetchExistingUsername } from "@/services/web3/utils/registrySigner";

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
import { encodeFunctionData } from "viem";
import PasskeyAccountABI from "../../../abi/PasskeyAccount.json";
import { buildUserOp, getUserOpHash } from "@/services/web3/passkey/userOpBuilder";
import { signUserOpWithPasskey } from "@/services/web3/passkey/passkeySign";
import { ENTRY_POINT_ADDRESS } from "@/config/passkey";
import { NETWORKS, DEFAULT_NETWORK } from "@/config/networks";

/**
 * Inner component that has access to DeployerContext
 */
function DeployerPageContent() {
  const { address, status } = useAccount();
  const { passkeyState, publicClient, bundlerClient } = useAuth();
  const signer = useEthersSigner();

  const { disconnect } = useDisconnect();

  // Clear any auto-reconnected wallet so users must explicitly choose auth method.
  // Passkey sessions are unaffected (managed separately in AuthContext).
  // Uses a ref so we only disconnect once (the first auto-reconnect), not after user-initiated connects.
  const hasDisconnectedAutoReconnect = useRef(false);
  const [walletUserConnected, setWalletUserConnected] = useState(false);

  useEffect(() => {
    if (!hasDisconnectedAutoReconnect.current && (status === 'reconnecting' || status === 'connected')) {
      hasDisconnectedAutoReconnect.current = true;
      disconnect();
    }
  }, [status, disconnect]);
  useEffect(() => {
    if (status === 'connecting') setWalletUserConnected(true);
    if (status === 'disconnected') setWalletUserConnected(false);
  }, [status]);
  const { addToIpfs } = useIPFScontext();
  const toast = useToast();
  const router = useRouter();
  const { state, actions } = useDeployer();

  // Fetch infrastructure addresses from subgraph
  const { data: infraData, loading: infraLoading, error: infraError } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    fetchPolicy: 'network-only',
  });


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

    // Helper to find beacon by type name (beacons are for org-level contract implementations)
    const findBeacon = (typeName) => {
      const beacon = infraData?.beacons?.find(b => b.typeName === typeName);
      return beacon?.beaconAddress || null;
    };

    // Extract beacon addresses (for reference - not typically called directly)
    const taskManagerBeacon = findBeacon('TaskManager');
    const hybridVotingBeacon = findBeacon('HybridVoting');
    const directDemocracyVotingBeacon = findBeacon('DirectDemocracyVoting');
    const educationHubBeacon = findBeacon('EducationHub');
    const participationTokenBeacon = findBeacon('ParticipationToken');
    const quickJoinBeacon = findBeacon('QuickJoin');
    const executorBeacon = findBeacon('Executor');
    const paymentManagerBeacon = findBeacon('PaymentManager');
    const eligibilityModuleBeacon = findBeacon('EligibilityModule');
    const toggleModuleBeacon = findBeacon('ToggleModule');

    return {
      // Core contracts
      registryAddress,
      poaManagerAddress,
      orgRegistryAddress,
      // Infrastructure proxies (the actual contracts to interact with)
      orgDeployerAddress,
      orgRegistryProxy,
      paymasterHubProxy,
      globalAccountRegistryProxy,
      // Beacons (for reference)
      taskManagerBeacon,
      hybridVotingBeacon,
      directDemocracyVotingBeacon,
      educationHubBeacon,
      participationTokenBeacon,
      quickJoinBeacon,
      executorBeacon,
      paymentManagerBeacon,
      eligibilityModuleBeacon,
      toggleModuleBeacon,
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
      console.log('Deploying with params:', deployParams);

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

      // === EIP-712 Registration Signature ===
      // Determine whether we need to sign for username registration during deploy.
      // The contract's HatsTreeSetup checks: accountRegistry != 0 && username.length > 0
      // && regSignature.length > 0. If any condition fails it silently skips registration.
      let regSignatureData = getSkipRegistrationDefaults();

      // When a passkey account is set it takes priority as deployer address (line 398).
      // We can only produce a valid ECDSA signature when the EOA IS the deployer,
      // because the contract checks that the recovered signer matches deployerAddress.
      const isPasskeyDeployer = !!passkeyState?.accountAddress;
      const hasNewUsername = deployerUsername && deployerUsername.trim().length > 0;

      if (!isPasskeyDeployer && signer && hasNewUsername) {
        try {
          console.log('[DEPLOY] Checking on-chain username for', address);
          const registryAddress = infrastructureAddresses.registryAddress;
          const existingOnChainUsername = await fetchExistingUsername(
            registryAddress,
            address,
            signer.provider
          );

          if (!existingOnChainUsername || existingOnChainUsername.trim().length === 0) {
            console.log('[DEPLOY] No existing username — requesting EIP-712 signature...');
            toast({
              title: 'Signature Required',
              description: 'Please sign the message in your wallet to register your username.',
              status: 'info',
              duration: 5000,
              isClosable: true,
            });

            const sigResult = await signRegistration({
              signer,
              registryAddress,
              username: deployerUsername,
              deadlineSeconds: 300,
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
          } else {
            console.log('[DEPLOY] User already has on-chain username:', existingOnChainUsername, '— skipping signature');
          }
        } catch (sigError) {
          if (sigError.code === 4001 || sigError.code === 'ACTION_REJECTED') {
            throw new Error('Username registration signature was rejected. Deployment cancelled.');
          }
          console.error('[DEPLOY] EIP-712 signing failed, continuing with defaults:', sigError);
          toast({
            title: 'Username registration skipped',
            description: 'Could not prepare the username signature. Your org will deploy without on-chain username registration. You can register your username later.',
            status: 'warning',
            duration: 8000,
            isClosable: true,
          });
        }
      } else {
        console.log('[DEPLOY] Skipping EIP-712 signing:', { isPasskeyDeployer, hasSigner: !!signer, hasNewUsername });
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
        });

        // Wrap in PasskeyAccount.execute(target, value, data)
        const fundingBigInt = paymasterFundingWei.gt(0) ? BigInt(paymasterFundingWei.toString()) : 0n;
        const accountCallData = encodeFunctionData({
          abi: PasskeyAccountABI,
          functionName: 'execute',
          args: [orgDeployerAddress, fundingBigInt, calldata],
        });

        // Build UserOp (no paymaster — account pays gas directly)
        const userOp = await buildUserOp({
          sender: passkeyState.accountAddress,
          callData: accountCallData,
          bundlerClient,
          publicClient,
        });

        // Sign with passkey (triggers biometric prompt)
        toast({
          title: 'Passkey Signature Required',
          description: 'Please authenticate with your passkey to deploy.',
          status: 'info',
          duration: 5000,
          isClosable: true,
        });

        const chainId = NETWORKS[DEFAULT_NETWORK].chainId;
        const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, chainId);
        const signature = await signUserOpWithPasskey(userOpHash, passkeyState.rawCredentialId);
        userOp.signature = signature;

        // Submit to bundler
        const opHash = await bundlerClient.sendUserOperation({
          ...userOp,
          entryPointAddress: ENTRY_POINT_ADDRESS,
        });

        console.log('[DEPLOY] UserOp submitted:', opHash);

        // Wait for confirmation
        const receipt = await bundlerClient.waitForUserOperationReceipt({
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
          signer,
          customRoles,
          infrastructureAddresses,
          regSignatureData,
          undefined, // overrideDeployerAddress
          paymasterConfig,
          paymasterFundingWei
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
