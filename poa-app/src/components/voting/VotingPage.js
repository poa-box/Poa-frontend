/**
 * VotingPage — the lifecycle voting board.
 *
 * Wave 2: replaces the old tabbed VotingTabs/VotingPanel surface with a single
 * lifecycle board (VotingBoard) fed by useVoteLanes, one GovernanceStrip
 * education header on top, and ONE PollDetail (replacing pollModal +
 * CompletedPollModal) driven by usePollNavigation.
 *
 * Container responsibilities (kept out of the presentation components):
 *   - CreateVoteModal wiring + handleProposalSubmit (forwarding actionSummaries)
 *   - vote handlers (return the executeWithNotification result so PollDetail can
 *     roll back its optimistic celebration on failure)
 *   - the finalize handler ("Count the votes"), routed through PollDetail's
 *     AlertDialog confirm
 *   - tour auto-open of CreateVoteModal at the create-vote-preview step
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Box, Container, Center, Flex, Heading, Button, Icon } from "@chakra-ui/react";
import { PiPlusCircle } from "react-icons/pi";
import PulseLoader from "@/components/shared/PulseLoader";
import { usePOContext } from "@/context/POContext";
import { useVotingContext } from "@/context/VotingContext";
import { useUserContext } from "@/context/UserContext";
import { useAuth } from "@/context/AuthContext";
import { useWeb3, useOrgTheme, useVoteLanes } from "@/hooks";
import { useOrgName } from "@/hooks/useOrgName";
import { VotingType } from "@/services/web3/domain/VotingService";

import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import VotingEducationHeader from "./VotingEducationHeader";
import { VotingBoard } from "./VotingBoard";
import { PollDetail } from "./PollDetail";
import CreateVoteModal from "./CreateVoteModal";

// Custom hooks for logic extraction
import { usePollNavigation } from "../../hooks/usePollNavigation";
import { useProposalForm } from "../../hooks/useProposalForm";
import { useTour } from "@/features/tour";

const VotingPage = () => {
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const { currentStepDef, isActive: isTourActive } = useTour();
  const tourOpenedModalRef = useRef(false);

  // Auto-open/close CreateVoteModal when tour reaches the create-vote-preview step
  useEffect(() => {
    const tourWantsModal = isTourActive && currentStepDef?.id === 'create-vote-preview';
    if (tourWantsModal && !showCreatePoll) {
      tourOpenedModalRef.current = true;
      setShowCreatePoll(true);
    } else if (!tourWantsModal && tourOpenedModalRef.current) {
      // Only close if the tour opened it (not if user opened it manually)
      tourOpenedModalRef.current = false;
      setShowCreatePoll(false);
    }
  }, [isTourActive, currentStepDef?.id, showCreatePoll]);

  // Web3 services hook
  const { voting, executeWithNotification } = useWeb3();
  const { pageBackground } = useOrgTheme();
  const userDAO = useOrgName();

  const {
    directDemocracyVotingContractAddress,
    votingContractAddress,
    taskManagerContractAddress,
    executorContractAddress,
    eligibilityModuleAddress,
    participationTokenAddress,
    poContextLoading,
    roleNames,
    leaderboardData,
    poMembers,
  } = usePOContext();

  const {
    hybridVotingOngoing,
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingCompleted,
    votingType: PTVoteType,
    votingClasses,
    refetch,
  } = useVotingContext();

  const { hasMemberRole } = useUserContext();
  const { accountAddress } = useAuth();
  const isConnected = !!accountAddress;

  // Derived lifecycle lanes (shared definitions with /votes + dashboard).
  const { lanes, loading, error } = useVoteLanes();

  // Poll navigation + the single PollDetail surface.
  const {
    selectedPoll,
    votingTypeSelected,
    handlePollClick,
    getContractAddressForVotingType,
    isDetailOpen,
    onDetailClose,
  } = usePollNavigation({
    democracyVotingOngoing,
    democracyVotingCompleted,
    hybridVotingOngoing,
    hybridVotingCompleted,
    PTVoteType,
  });

  // PollDetail must render LIVE data — selectedPoll is a click-time snapshot,
  // so optimistic votes and 30s polling refreshes would never reach an open
  // detail (celebration bars would exclude the user's own vote). Re-derive the
  // fresh transformed proposal by id on every context update.
  const livePoll = useMemo(() => {
    if (!selectedPoll) return null;
    const all = [
      ...hybridVotingOngoing,
      ...hybridVotingCompleted,
      ...democracyVotingOngoing,
      ...democracyVotingCompleted,
    ];
    return all.find((p) => p.id === selectedPoll.id) || selectedPoll;
  }, [selectedPoll, hybridVotingOngoing, hybridVotingCompleted, democracyVotingOngoing, democracyVotingCompleted]);

  // Proposal creation
  const handleProposalSubmit = useCallback(async (proposalData) => {
    if (!voting) return;

    const proposalParams = {
      name: proposalData.name,
      description: proposalData.description,
      durationMinutes: proposalData.time,
      numOptions: proposalData.numOptions,
      optionNames: proposalData.optionNames || [],
      batches: proposalData.batches || [],
      hatIds: proposalData.hatIds || [],
      // Forward human-readable action previews so the metadata JSON carries
      // them (useProposalForm emits this; the old VotingPage dropped it).
      actionSummaries: proposalData.actionSummaries || [],
    };

    const isExecutionProposal =
      proposalData.type === 'setter'
      || proposalData.type === 'election'
      || proposalData.type === 'createRole';

    const result = await executeWithNotification(
      () => isExecutionProposal
        ? voting.createHybridProposal(votingContractAddress, proposalParams)
        : voting.createDDProposal(directDemocracyVotingContractAddress, proposalParams),
      {
        pendingMessage: 'Creating proposal...',
        successMessage: 'Proposal created successfully!',
        refreshEvent: 'proposal:created',
      }
    );

    if (result.success) {
      setShowCreatePoll(false);
    }
  }, [voting, executeWithNotification, directDemocracyVotingContractAddress, votingContractAddress]);

  const {
    proposal,
    loadingSubmit,
    handleInputChange,
    handleOptionChange,
    addOption,
    removeOption,
    handleProposalTypeChange,
    handleTransferAddressChange,
    handleTransferAmountChange,
    handleRestrictedToggle,
    toggleRestrictedRole,
    handleSetterChange,
    handleSubmit,
  } = useProposalForm({
    onSubmit: handleProposalSubmit,
  });

  const contractAddresses = useMemo(() => ({
    votingContractAddress,
    directDemocracyVotingContractAddress,
    taskManagerContractAddress,
    executorContractAddress,
    participationTokenAddress,
  }), [votingContractAddress, directDemocracyVotingContractAddress, taskManagerContractAddress, executorContractAddress, participationTokenAddress]);

  const handlePollCreated = useCallback(() => {
    return handleSubmit(eligibilityModuleAddress, contractAddresses);
  }, [handleSubmit, eligibilityModuleAddress, contractAddresses]);

  const handleCreatePollClick = useCallback(() => {
    setShowCreatePoll(prev => !prev);
  }, []);

  // Finalize ("Count the votes") — routed through PollDetail's AlertDialog.
  // RETURNS the result so the confirm dialog can await it.
  const handleGetWinner = useCallback(async (contractAddress, proposalId, isHybrid = false) => {
    if (!voting) return { success: false };

    const type = isHybrid ? VotingType.HYBRID : VotingType.DIRECT_DEMOCRACY;
    return executeWithNotification(
      () => voting.announceWinner(type, contractAddress, proposalId),
      {
        pendingMessage: 'Counting the votes...',
        successMessage: 'Result recorded on-chain!',
        refreshEvent: 'proposal:completed',
      }
    );
  }, [voting, executeWithNotification]);

  // Vote handlers — RETURN the executeWithNotification result so PollDetail can
  // react (roll back the optimistic celebration + show the calm error on fail).
  const handleDDVote = useCallback(async (contractAddress, proposalId, optionIndices, weights) => {
    if (!voting) return { success: false };
    return executeWithNotification(
      () => voting.castDDVote(contractAddress, proposalId, optionIndices, weights),
      {
        pendingMessage: 'Casting vote...',
        successMessage: 'Vote cast successfully!',
        refreshEvent: 'proposal:voted',
      }
    );
  }, [voting, executeWithNotification]);

  const handleHybridVote = useCallback(async (contractAddress, proposalId, optionIndices, weights) => {
    if (!voting) return { success: false };
    return executeWithNotification(
      () => voting.castHybridVote(contractAddress, proposalId, optionIndices, weights),
      {
        pendingMessage: 'Casting vote...',
        successMessage: 'Vote cast successfully!',
        refreshEvent: 'proposal:voted',
      }
    );
  }, [voting, executeWithNotification]);

  const canCreate = hasMemberRole;

  return (
    <>
      <Navbar />
      {poContextLoading ? (
        <Center height="90vh" background={pageBackground()}>
          <PulseLoader size="xl" />
        </Center>
      ) : (
        <Container maxW="container.2xl" py={4} px={{ base: "1%", md: "3%" }} minH="100vh" background={pageBackground()}>
          {/* GovernanceStrip — wave-1 education header (collapses after first visit). */}
          <Box data-tour="voting-header" mb={6}>
            <VotingEducationHeader selectedTab={0} PTVoteType={PTVoteType} />
          </Box>

          {/* Board header row: title + Create Vote CTA (top-right). */}
          <Flex justify="space-between" align="center" mb={5} gap={3} flexWrap="wrap">
            <Heading as="h1" size="lg" color="white" fontWeight="800">
              Votes
            </Heading>
            {canCreate && (
              <Button
                leftIcon={<Icon as={PiPlusCircle} boxSize={5} />}
                minH="44px"
                bg="#9473DC"
                color="white"
                _hover={{ bg: "#B79BF0" }}
                onClick={handleCreatePollClick}
              >
                Create vote
              </Button>
            )}
          </Flex>

          <VotingBoard
            lanes={lanes}
            loading={loading}
            error={error}
            onRetry={refetch}
            onOpenPoll={(p) => handlePollClick(p, !p.isOngoing)}
            onFinalize={(p) => handlePollClick(p, false)}
            poMembers={poMembers}
            isConnected={isConnected}
            isMember={hasMemberRole}
            canCreate={canCreate}
            onCreate={handleCreatePollClick}
            orgName={userDAO}
          />

          <CreateVoteModal
            isOpen={showCreatePoll}
            onClose={handleCreatePollClick}
            proposal={proposal}
            handleInputChange={handleInputChange}
            handleOptionChange={handleOptionChange}
            addOption={addOption}
            removeOption={removeOption}
            handleProposalTypeChange={handleProposalTypeChange}
            handleTransferAddressChange={handleTransferAddressChange}
            handleTransferAmountChange={handleTransferAmountChange}
            handleRestrictedToggle={handleRestrictedToggle}
            toggleRestrictedRole={toggleRestrictedRole}
            handleSetterChange={handleSetterChange}
            handlePollCreated={handlePollCreated}
            loadingSubmit={loadingSubmit}
            roleNames={roleNames}
            votingClasses={votingClasses}
            leaderboardData={leaderboardData}
            ongoingProposals={hybridVotingOngoing}
          />

          {/* ONE detail surface for ongoing AND completed polls. */}
          <PollDetail
            poll={livePoll}
            isOpen={isDetailOpen}
            onClose={onDetailClose}
            onVote={votingTypeSelected === "Direct Democracy" ? handleDDVote : handleHybridVote}
            onFinalize={handleGetWinner}
            contractAddress={getContractAddressForVotingType(
              directDemocracyVotingContractAddress,
              votingContractAddress
            )}
            votingTypeSelected={votingTypeSelected}
          />
        </Container>
      )}
    </>
  );
};

export default VotingPage;
