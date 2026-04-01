/**
 * useVotingPower - Hook for calculating and displaying user's voting power
 * VERSION: 2.0 (simplified - uses VotingContext data)
 *
 * Provides a breakdown of how the user's vote is calculated in hybrid voting:
 * - Membership power (from direct democracy class)
 * - Contribution power (from participation token balance)
 * - Combined total and percentage of org voting power
 */

import { useMemo } from 'react';
import { usePOContext } from '../context/POContext';
import { useUserContext } from '../context/UserContext';
import { useVotingContext } from '../context/VotingContext';
import { formatTokenAmount } from '../util/formatToken';

// Voting strategy constants (matching subgraph enum)
const VOTING_STRATEGY = {
  DIRECT: 'DIRECT',
  ERC20_BAL: 'ERC20_BAL',
};

/**
 * Calculate square root for quadratic voting (matching contract logic)
 */
function sqrt(value) {
  if (value < 0n) return 0n;
  if (value === 0n) return 0n;

  let z = value;
  let x = value / 2n + 1n;

  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }

  return z;
}

/**
 * Parse a token balance string to BigInt (handles decimals)
 */
function parseTokenBalance(balanceString) {
  if (!balanceString) return 0n;

  // If it's already a number or BigInt-like
  if (typeof balanceString === 'number') {
    return BigInt(Math.floor(balanceString));
  }

  // Handle string with decimals (e.g., "123.45")
  const str = String(balanceString);
  const parts = str.split('.');

  if (parts.length === 1) {
    // No decimals
    return BigInt(parts[0] || '0');
  }

  // Has decimals - treat as whole units (the balance is already formatted)
  // For voting power calculation, use the raw integer value
  return BigInt(parts[0] || '0');
}

/**
 * Hook to calculate user's voting power breakdown
 */
export function useVotingPower() {
  const { poMembers, leaderboardData } = usePOContext();
  const { userData, hasMemberRole } = useUserContext();
  const { votingType, votingClasses: subgraphClasses, loading: votingLoading } = useVotingContext();

  // Default class configuration for fallback (matches subgraph enum format)
  const defaultClasses = [
    {
      strategy: 'DIRECT',
      slicePct: 50,
      quadratic: false,
      minBalance: '0',
      asset: null,
      hatIds: [],
    },
    {
      strategy: 'ERC20_BAL',
      slicePct: 50,
      quadratic: true,
      minBalance: '0',
      asset: null,
      hatIds: [],
    },
  ];

  // Use subgraph classes if available, otherwise use defaults
  const classConfig = useMemo(() => {
    if (votingType !== 'Hybrid') return null;

    // If we have classes from subgraph, use them (strategy is a string enum: 'DIRECT' or 'ERC20_BAL')
    if (subgraphClasses && subgraphClasses.length > 0) {
      return subgraphClasses.map(cls => ({
        ...cls,
        slicePct: Number(cls.slicePct),
      }));
    }

    // Fall back to defaults if subgraph doesn't have classes yet
    return defaultClasses;
  }, [votingType, subgraphClasses]);

  // Derive loading state
  const isLoading = votingLoading;

  // Calculate voting power
  const votingPower = useMemo(() => {
    // Default response for non-members or when data isn't loaded
    const defaultPower = {
      membershipPower: 0,
      contributionPower: 0,
      totalPower: 0,
      percentOfTotal: 0,
      classWeights: { democracy: 50, contribution: 50 },
      isHybrid: votingType === 'Hybrid',
      hasVotingPower: false,
      status: 'unknown',
    };

    if (!hasMemberRole) {
      return { ...defaultPower, message: 'Join to participate in voting', status: 'not_member' };
    }

    // Direct Democracy mode
    if (votingType !== 'Hybrid') {
      const memberCount = poMembers || 1;
      return {
        membershipPower: 100,
        contributionPower: 0,
        totalPower: 100,
        percentOfTotal: memberCount > 0 ? (100 / memberCount) : 0,
        classWeights: { democracy: 100, contribution: 0 },
        isHybrid: false,
        hasVotingPower: true,
        message: 'Equal voice with all members',
        status: 'ready',
      };
    }

    if (!classConfig || classConfig.length === 0) {
      return { ...defaultPower, message: 'Loading...', status: 'loading' };
    }

    // Calculate power from class config - read weights directly from subgraph
    let membershipPower = 0;
    let contributionPower = 0;
    let democracyWeight = 0;
    let contributionWeight = 0;

    classConfig.forEach((cls) => {
      if (cls.strategy === VOTING_STRATEGY.DIRECT) {
        membershipPower = 100;
        democracyWeight = Number(cls.slicePct);
      } else if (cls.strategy === VOTING_STRATEGY.ERC20_BAL) {
        contributionWeight = Number(cls.slicePct);

        // Get user's token balance
        const rawBalance = userData?.participationTokenBalance || '0';
        const balance = parseTokenBalance(rawBalance);

        // Check minimum balance — convert minBalance from wei to human-readable
        // units to match balance (which was already formatted by formatTokenAmount)
        const minBalance = parseTokenBalance(formatTokenAmount(cls.minBalance || '0'));
        if (balance < minBalance) {
          contributionPower = 0;
        } else {
          // Apply quadratic if enabled
          if (cls.quadratic) {
            contributionPower = Number(sqrt(balance) * 100n);
          } else {
            contributionPower = Number(balance * 100n);
          }
        }
      }
    });

    const totalPower = membershipPower + contributionPower;

    // Calculate comparative statistics for the org
    let orgStats = {
      averagePower: 0,
      maxPower: 0,
      totalOrgPower: 0,
      userRank: 0,
      percentOfTotal: 0,
      aboveAverage: false,
    };

    if (leaderboardData?.length > 0) {
      let totalMembershipPower = 0;
      let totalContributionPower = 0;

      const userPowers = leaderboardData.map(user => {
        const userBalance = parseTokenBalance(user.token || '0');
        let userContrib = 0;

        const contribClass = classConfig.find(c => c.strategy === VOTING_STRATEGY.ERC20_BAL);
        if (contribClass) {
          // Apply same minBalance check as personal power calculation
          const minBal = parseTokenBalance(formatTokenAmount(contribClass.minBalance || '0'));
          if (userBalance >= minBal) {
            if (contribClass.quadratic) {
              userContrib = Number(sqrt(userBalance) * 100n);
            } else {
              userContrib = Number(userBalance * 100n);
            }
          }
        }

        totalMembershipPower += 100;
        totalContributionPower += userContrib;
        return { membership: 100, contribution: userContrib, total: 100 + userContrib };
      });

      const totalRawPower = userPowers.reduce((a, b) => a + b.total, 0);

      // Calculate share per-class then weight — matches contract logic:
      // share = (userMembership/totalMembership) × membershipWeight
      //       + (userContribution/totalContribution) × contributionWeight
      const membershipShare = totalMembershipPower > 0
        ? (membershipPower / totalMembershipPower)
        : 0;
      // When no one has tokens, everyone is equally powerful in the contribution class
      const memberCount = userPowers.length || 1;
      const contributionShare = totalContributionPower > 0
        ? (contributionPower / totalContributionPower)
        : (1 / memberCount);

      orgStats.totalOrgPower = totalRawPower;
      orgStats.averagePower = totalRawPower / userPowers.length;
      orgStats.maxPower = Math.max(...userPowers.map(p => p.total));
      orgStats.percentOfTotal = (membershipShare * democracyWeight) + (contributionShare * contributionWeight);
      orgStats.aboveAverage = totalPower > orgStats.averagePower;

      const sortedPowers = [...userPowers.map(p => p.total)].sort((a, b) => b - a);
      orgStats.userRank = sortedPowers.findIndex(p => p <= totalPower) + 1;
    }

    const result = {
      membershipPower,
      contributionPower,
      totalPower,
      percentOfTotal: Math.min(orgStats.percentOfTotal, 100),
      classWeights: {
        democracy: democracyWeight,
        contribution: contributionWeight,
      },
      orgStats,
      isHybrid: true,
      hasVotingPower: totalPower > 0,
      message: totalPower > 0
        ? `Your voice: ${democracyWeight}% membership + ${contributionWeight}% contribution`
        : 'You need membership or contributions to vote',
      status: 'ready',
    };

    return result;
  }, [classConfig, userData, hasMemberRole, votingType, poMembers, leaderboardData]);

  return {
    ...votingPower,
    classConfig,
    isLoading,
  };
}

export default useVotingPower;
