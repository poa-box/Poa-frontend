import React, { createContext, useContext, useEffect, useMemo, useCallback, useReducer, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_VOTING_DATA_NEW } from '../util/queries';
import { usePOContext } from './POContext';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';

const VotingContext = createContext();

export const useVotingContext = () => useContext(VotingContext);

/**
 * Compute per-option scores EXACTLY the way the on-chain contract does
 * (VotingMath.pickWinnerNSlices + HybridVotingCore.vote). This matters:
 * matching the contract's integer-division precision means the UI shows
 * ties as ties when the contract sees them as ties, rather than giving
 * the illusion that one option is slightly ahead when the contract
 * considers them equal (and picks one by iteration order with
 * `isValid=false`).
 *
 * Contract integer math (all BigInt, all floor division):
 *
 *   optionClassRaw[opt][c] = Σ_voters floor(classRawPowers[c] × weight / 100)
 *   classTotalsRaw[c]      = Σ_voters classRawPowers[c]         // NB: full raw, not weighted
 *   score[opt]             = Σ_c floor(optionClassRaw[opt][c] × slice[c] / classTotal[c])
 *
 * score[opt] is in 0..100 units (when slices sum to 100). Due to integer
 * truncation when tokens are very large, the class-1 contribution is
 * typically 0..slice[c] with only a handful of distinct values.
 *
 * @param {Array} votes - Array of Vote entities from the subgraph
 * @param {number} numOptions - Number of options in the proposal
 * @param {number[]} slices - Slice percentages per class (sums to 100)
 * @returns {{scores: number[], voterCounts: number[], distinctVoters: number}}
 */
function computeHybridOptionScores(votes, numOptions, slices) {
    const numClasses = slices.length;
    const classTotalRaw = new Array(numClasses).fill(0n);
    const optionClassRaw = Array.from({ length: numOptions }, () => new Array(numClasses).fill(0n));
    const voterCounts = new Array(numOptions).fill(0);

    for (const vote of votes) {
        const rawPowers = (vote.classRawPowers || []).map(p => BigInt(p || 0));
        while (rawPowers.length < numClasses) rawPowers.push(0n);

        // Matches contract: p.classTotalsRaw[c] += rawPower (unweighted)
        for (let c = 0; c < numClasses; c++) {
            classTotalRaw[c] += rawPowers[c];
        }

        // Matches contract: p.options[ix].classRaw[c] += floor(rawPower × weight / 100)
        const idxs = vote.optionIndexes || [];
        const weights = vote.optionWeights || [];
        for (let i = 0; i < idxs.length; i++) {
            const optIdx = idxs[i];
            if (optIdx < 0 || optIdx >= numOptions) continue;
            const weight = BigInt(weights[i] ?? 100);
            for (let c = 0; c < numClasses; c++) {
                optionClassRaw[optIdx][c] += (rawPowers[c] * weight) / 100n;
            }
            voterCounts[optIdx] += 1;
        }
    }

    // Contract score: floor((optRaw × slice) / classTotal), summed across classes.
    // Must NOT add extra precision — ties matter. If we used (× 10000 / 10000)
    // for basis-point precision, we'd rank tied options differently than the
    // contract does and the winner label would disagree with the highest %.
    const scores = new Array(numOptions).fill(0);
    for (let opt = 0; opt < numOptions; opt++) {
        let score = 0n;
        for (let c = 0; c < numClasses; c++) {
            if (classTotalRaw[c] > 0n) {
                score += (optionClassRaw[opt][c] * BigInt(slices[c])) / classTotalRaw[c];
            }
        }
        scores[opt] = Number(score);
    }

    return { scores, voterCounts, distinctVoters: votes.length };
}

function transformProposal(proposal, votingTypeId, type, thresholdPct = 0, quorum = 0, votingClasses = []) {
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
    const numOptions = proposal.numOptions || 2;

    const options = [];
    let totalVotes = 0;

    if (type === 'Hybrid') {
        // Replicate the on-chain winner math. If we don't have voting classes yet
        // (subgraph lag or no classes defined), fall back to voter-count only —
        // percentages may be briefly off until classes load.
        const slices = votingClasses.map(c => Number(c.slicePct));
        const votes = proposal.votes || [];

        if (slices.length > 0 && slices.some(s => s > 0)) {
            const { scores, voterCounts, distinctVoters } = computeHybridOptionScores(
                votes, numOptions, slices
            );
            const scoreSum = scores.reduce((a, b) => a + b, 0);
            totalVotes = distinctVoters;

            for (let i = 0; i < numOptions; i++) {
                // Normalize so bars visually sum to 100% even when some classes
                // have zero voters (contract's raw score can be < 100 in that case).
                const percentage = scoreSum > 0 ? (scores[i] / scoreSum) * 100 : 0;
                options.push({
                    id: `${proposal.id}-option-${i}`,
                    name: optionNames[i] || `Option ${i + 1}`,
                    votes: voterCounts[i],
                    displayVotes: String(voterCounts[i]),
                    percentage,
                    currentPercentage: Math.round(percentage),
                    rawScore: scores[i], // 0-100 scale (contract units) before normalization
                });
            }
        } else {
            // Fallback: count voters per option with no class weighting
            const voterCounts = new Array(numOptions).fill(0);
            for (const vote of votes) {
                (vote.optionIndexes || []).forEach(optIdx => {
                    if (optIdx >= 0 && optIdx < numOptions) voterCounts[optIdx] += 1;
                });
            }
            const total = voterCounts.reduce((a, b) => a + b, 0);
            totalVotes = votes.length;
            for (let i = 0; i < numOptions; i++) {
                const percentage = total > 0 ? (voterCounts[i] / total) * 100 : 0;
                options.push({
                    id: `${proposal.id}-option-${i}`,
                    name: optionNames[i] || `Option ${i + 1}`,
                    votes: voterCounts[i],
                    displayVotes: String(voterCounts[i]),
                    percentage,
                    currentPercentage: Math.round(percentage),
                });
            }
        }
    } else {
        // Direct Democracy: 1-person-1-vote with weight distribution
        const optionWeightSum = new Array(numOptions).fill(0);
        const voterCounts = new Array(numOptions).fill(0);
        for (const vote of proposal.votes || []) {
            (vote.optionIndexes || []).forEach((optIdx, i) => {
                if (optIdx < 0 || optIdx >= numOptions) return;
                const weight = vote.optionWeights?.[i] ?? 100;
                optionWeightSum[optIdx] += weight;
                voterCounts[optIdx] += 1;
            });
            totalVotes += 100;
        }
        const totalWeight = optionWeightSum.reduce((a, b) => a + b, 0);
        for (let i = 0; i < numOptions; i++) {
            const percentage = totalWeight > 0 ? (optionWeightSum[i] / totalWeight) * 100 : 0;
            options.push({
                id: `${proposal.id}-option-${i}`,
                name: optionNames[i] || `Option ${i + 1}`,
                votes: voterCounts[i],
                displayVotes: String(voterCounts[i]),
                percentage,
                currentPercentage: Math.round(percentage),
            });
        }
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

                // Process voting classes first — transformProposal needs them for
                // the per-class-weighted percentage math (matches contract logic).
                // Filter to latest version only (subgraph bug: old versions stay isActive).
                // NOTE: This uses CURRENT classes, not the classesSnapshot stored on
                // each proposal at creation time. If classes changed mid-proposal
                // lifetime, percentages may drift from the exact on-chain calculation.
                const rawClasses = org.hybridVoting.votingClasses || [];
                const maxVersion = rawClasses.reduce(
                    (max, c) => Math.max(max, Number(c.version || 0)), 0
                );
                const activeClasses = rawClasses
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
                update.votingClasses = activeClasses;

                hybridProposals = (org.hybridVoting.proposals || []).map(p =>
                    transformProposal(p, org.hybridVoting.id, 'Hybrid', hybridThreshold, hybridQuorum, activeClasses)
                );
                update.hybridVotingOngoing = hybridProposals.filter(p => p.isOngoing);
                const hybridCompleted = hybridProposals.filter(p => !p.isOngoing);
                hybridCompleted.sort((a, b) => parseInt(b.endTimestamp) - parseInt(a.endTimestamp));
                update.hybridVotingCompleted = hybridCompleted;
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
