import React, { createContext, useContext, useEffect, useMemo, useCallback, useReducer, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_VOTING_DATA_NEW } from '../util/queries';
import { usePOContext } from './POContext';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';
import { formatTokenAmount } from '../util/formatToken';

const VotingContext = createContext();

export const useVotingContext = () => useContext(VotingContext);

function transformProposal(proposal, votingTypeId, type, thresholdPct = 0, quorum = 0) {
    const currentTime = Math.floor(Date.now() / 1000);
    const endTime = parseInt(proposal.endTimestamp) || 0;
    // A proposal is "ongoing" if it's still Active (needs voting or winner announcement)
    // It moves to "completed" only after status changes from Active
    const isOngoing = proposal.status === 'Active';
    // Track if voting period has ended (but winner may not be announced yet)
    const isExpired = endTime <= currentTime;

    // Get metadata from IPFS (if subgraph has indexed it)
    const metadata = proposal.metadata || {};
    const description = metadata.description || '';
    const optionNames = metadata.optionNames || [];

    // Aggregate votes per option - different logic for Hybrid vs DD
    const optionVotes = {};
    const optionVotesRaw = {}; // BigInt string versions for Hybrid display formatting
    let totalVotes = 0;

    if (type === 'Hybrid') {
        // For Hybrid voting, use classRawPowers to calculate weighted voting power
        (proposal.votes || []).forEach(vote => {
            // Sum all class powers for this voter (BigInt handling)
            const classRawPowers = vote.classRawPowers || [];
            const votePower = classRawPowers.reduce((sum, p) => {
                const powerValue = typeof p === 'string' ? BigInt(p) : BigInt(p || 0);
                return sum + powerValue;
            }, BigInt(0));

            // Apply vote weights to each selected option
            (vote.optionIndexes || []).forEach((optionIndex, i) => {
                const weight = vote.optionWeights?.[i] ?? 100;
                // Calculate power contribution: (votePower * weight) / 100
                const optionPower = (votePower * BigInt(weight)) / BigInt(100);
                const current = optionVotes[optionIndex] || BigInt(0);
                optionVotes[optionIndex] = current + optionPower;
            });

            totalVotes += Number(votePower);
        });

        // Store BigInt strings for formatting before losing precision
        Object.keys(optionVotes).forEach(k => {
            optionVotesRaw[k] = optionVotes[k].toString();
            optionVotes[k] = Number(optionVotes[k]);
        });
    } else {
        // For Direct Democracy, simple 1-person-1-vote with weight distribution
        (proposal.votes || []).forEach(vote => {
            (vote.optionIndexes || []).forEach((optionIndex, i) => {
                const weight = vote.optionWeights?.[i] ?? 100;
                optionVotes[optionIndex] = (optionVotes[optionIndex] || 0) + weight;
            });
            totalVotes += 100; // Each voter contributes 100 points total
        });
    }

    // Create options array - use metadata option names if available, fallback to generic
    const options = [];
    const totalOptionVotes = Object.values(optionVotes).reduce((sum, v) => sum + v, 0);
    for (let i = 0; i < (proposal.numOptions || 2); i++) {
        const votes = optionVotes[i] || 0;
        const displayVotes = type === 'Hybrid'
            ? formatTokenAmount(optionVotesRaw[i] || '0')
            : String(votes);
        options.push({
            id: `${proposal.id}-option-${i}`,
            name: optionNames[i] || `Option ${i + 1}`,
            votes: votes,
            displayVotes,
            percentage: totalOptionVotes > 0 ? (votes / totalOptionVotes) * 100 : 0,
            currentPercentage: totalOptionVotes > 0 ? Math.round((votes / totalOptionVotes) * 100) : 0,
        });
    }

    // Parse winningOption as number (comes as BigInt string from subgraph)
    const winningOptionNum = proposal.winningOption !== null && proposal.winningOption !== undefined
        ? parseInt(proposal.winningOption, 10)
        : null;

    return {
        id: proposal.id,
        proposalId: proposal.proposalId,
        title: proposal.title || 'Indexing...',
        description: description,
        descriptionHash: proposal.descriptionHash,
        startTimestamp: proposal.startTimestamp,
        endTimestamp: proposal.endTimestamp,
        winningOption: winningOptionNum,
        isValid: proposal.isValid,
        wasExecuted: proposal.wasExecuted,
        executionFailed: proposal.executionFailed === true,
        executionError: proposal.executionError || null,
        status: proposal.status,
        isOngoing,
        isExpired,
        options,
        totalVotes,
        votes: proposal.votes || [],
        votingTypeId,
        type,
        thresholdPct,
        quorum,
        isHatRestricted: proposal.isHatRestricted,
        restrictedHatIds: proposal.restrictedHatIds || [],
    };
}

const initialVotingState = {
    hybridVotingOngoing: [],
    hybridVotingCompleted: [],
    democracyVotingOngoing: [],
    democracyVotingCompleted: [],
    ongoingPolls: [],
    votingType: 'Hybrid',
    votingClasses: [],
};

function votingReducer(state, action) {
    switch (action.type) {
        case 'SET_VOTING_DATA':
            return { ...state, ...action.payload };
        default:
            return state;
    }
}

export const VotingProvider = ({ children }) => {
    const [state, dispatch] = useReducer(votingReducer, initialVotingState);

    const { orgId, subgraphUrl } = usePOContext();
    const apolloContext = React.useMemo(() => ({ subgraphUrl }), [subgraphUrl]);

    const { data, loading, refetch } = useQuery(FETCH_VOTING_DATA_NEW, {
        variables: { orgId: orgId },
        skip: !orgId,
        fetchPolicy: 'cache-first',
        context: apolloContext,
    });

    // Ref-stabilize refetch so callbacks don't re-create when Apollo returns a new reference
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;

    // Refetch immediately — executeWithNotification already waited for the
    // subgraph to index the transaction block before emitting the event.
    const handleRefresh = useCallback(() => {
        if (orgId) {
            refetchRef.current();
        }
    }, [orgId]);

    // Subscribe only to voting-specific events (not ALL, which fires on every event)
    useRefreshSubscription(
        [RefreshEvent.PROPOSAL_CREATED, RefreshEvent.PROPOSAL_VOTED, RefreshEvent.PROPOSAL_COMPLETED],
        handleRefresh,
        [handleRefresh]
    );

    useEffect(() => {
        if (data?.organization) {
            const org = data.organization;
            let hybridProposals = [];
            let ddProposals = [];
            const update = {};

            if (org.hybridVoting) {
                update.votingType = 'Hybrid';
            } else if (org.directDemocracyVoting) {
                update.votingType = 'Direct Democracy';
            }

            // Process Hybrid Voting proposals and classes
            if (org.hybridVoting) {
                const hybridThreshold = org.hybridVoting.thresholdPct || 0;
                const hybridQuorum = org.hybridVoting.quorum || 0;
                hybridProposals = (org.hybridVoting.proposals || []).map(p =>
                    transformProposal(p, org.hybridVoting.id, 'Hybrid', hybridThreshold, hybridQuorum)
                );
                update.hybridVotingOngoing = hybridProposals.filter(p => p.isOngoing);
                const hybridCompleted = hybridProposals.filter(p => !p.isOngoing);
                hybridCompleted.sort((a, b) => parseInt(b.endTimestamp) - parseInt(a.endTimestamp));
                update.hybridVotingCompleted = hybridCompleted;

                // Process voting classes - convert to usable format
                // Filter to latest version only (subgraph bug: old versions stay isActive)
                const rawClasses = org.hybridVoting.votingClasses || [];
                const maxVersion = rawClasses.reduce(
                    (max, c) => Math.max(max, Number(c.version || 0)), 0
                );
                update.votingClasses = rawClasses
                    .filter(c => Number(c.version || 0) === maxVersion)
                    .map(c => ({
                        classIndex: Number(c.classIndex),
                        strategy: c.strategy,
                        slicePct: Number(c.slicePct),
                        quadratic: c.quadratic,
                        minBalance: c.minBalance?.toString() || '0',
                        asset: c.asset,
                        hatIds: (c.hatIds || []).map(h => h.toString()),
                    }))
                    .sort((a, b) => a.classIndex - b.classIndex);
            } else {
                update.hybridVotingOngoing = [];
                update.hybridVotingCompleted = [];
                update.votingClasses = [];
            }

            // Process Direct Democracy Voting proposals
            if (org.directDemocracyVoting) {
                const ddThreshold = org.directDemocracyVoting.thresholdPct || 0;
                const ddQuorum = org.directDemocracyVoting.quorum || 0;
                ddProposals = (org.directDemocracyVoting.ddvProposals || []).map(p =>
                    transformProposal(p, org.directDemocracyVoting.id, 'Direct Democracy', ddThreshold, ddQuorum)
                );
                update.democracyVotingOngoing = ddProposals.filter(p => p.isOngoing);
                const ddCompleted = ddProposals.filter(p => !p.isOngoing);
                ddCompleted.sort((a, b) => parseInt(b.endTimestamp) - parseInt(a.endTimestamp));
                update.democracyVotingCompleted = ddCompleted;
            } else {
                update.democracyVotingOngoing = [];
                update.democracyVotingCompleted = [];
            }

            // Combine all ongoing polls from already-transformed proposals
            update.ongoingPolls = [
                ...hybridProposals.filter(p => p.isOngoing),
                ...ddProposals.filter(p => p.isOngoing),
            ];

            // Single dispatch — one re-render instead of 7
            dispatch({ type: 'SET_VOTING_DATA', payload: update });
        }
    }, [data]);

    const contextValue = useMemo(() => ({
        hybridVotingOngoing: state.hybridVotingOngoing,
        hybridVotingCompleted: state.hybridVotingCompleted,
        democracyVotingOngoing: state.democracyVotingOngoing,
        democracyVotingCompleted: state.democracyVotingCompleted,
        loading,
        ongoingPolls: state.ongoingPolls,
        votingType: state.votingType,
        votingClasses: state.votingClasses,
    }), [state, loading]);

    return (
        <VotingContext.Provider value={contextValue}>
            {children}
        </VotingContext.Provider>
    );
};
