/** Core power arithmetic projected onto the existing host UI fields. */
import { useMemo } from 'react';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useVotingContext } from '@/context/VotingContext';
import { useAuth } from '@/context/authState';
import { computeClassEntry } from '@/lib/voting/powerAdapter';

export function useVotingPower() {
  const { poMembers, leaderboardData = [], roleNames = {}, participationTokenAddress } = usePOContext();
  const { userData, hasMemberRole, userDataLoading } = useUserContext();
  const { isAuthHydrated } = useAuth();
  const identityPending = isAuthHydrated === false || Boolean(userDataLoading);
  const { votingType, votingClasses, loading: votingLoading } = useVotingContext();
  const isHybrid = votingType === 'Hybrid';
  const hasRealClasses = Array.isArray(votingClasses) && votingClasses.length > 0;
  const classConfig = isHybrid && hasRealClasses ? votingClasses : null;
  const classBreakdown = useMemo(() => {
    if (!isHybrid || !hasRealClasses) return null;
    return votingClasses.map(cls => computeClassEntry({
      cls, userHatIds: userData?.hatIds || [],
      userBalanceWei: userData?.participationTokenBalanceWei,
      balanceAsset: participationTokenAddress, leaderboardData, poMembers,
      roleNames: (cls.hatIds || []).map(id => roleNames[String(id)]).filter(Boolean),
    })).sort((a, b) => a.classIndex - b.classIndex);
  }, [isHybrid, hasRealClasses, votingClasses, userData, participationTokenAddress, leaderboardData, poMembers, roleNames]);
  const totalSharePct = !classBreakdown || classBreakdown.some(c => c.indeterminate || (c.eligible && !c.shareKnown))
    ? null : classBreakdown.reduce((sum, c) => sum + c.contributionToTotalPct, 0);
  const breakdownStatus = identityPending ? 'loading' : !hasMemberRole ? 'not_member'
    : isHybrid && (!classBreakdown || classBreakdown.some(c => c.indeterminate)) ? 'loading' : 'ready';
  const membership = classBreakdown?.filter(c => c.strategy === 'DIRECT') || [];
  const contribution = classBreakdown?.filter(c => c.strategy !== 'DIRECT') || [];
  const membershipPower = hasMemberRole ? (isHybrid ? membership.reduce((sum, c) => sum + (c.eligible ? 100 : 0), 0) : 100) : 0;
  const contributionPower = hasMemberRole ? contribution.reduce((sum, c) => sum + c.userRawPower * 100, 0) : 0;
  const totalPower = membershipPower + contributionPower;
  const democracy = isHybrid ? membership.reduce((sum, c) => sum + c.slicePct, 0) : 100;
  const contributionWeight = isHybrid ? contribution.reduce((sum, c) => sum + c.slicePct, 0) : 0;
  const percentOfTotal = hasMemberRole ? (isHybrid ? totalSharePct ?? 0 : (poMembers > 0 ? 100 / poMembers : null)) : 0;
  return {
    membershipPower, contributionPower, totalPower, percentOfTotal,
    classWeights: { democracy, contribution: contributionWeight },
    // Legacy display-only fields. No invented org power/rank from rounded balances.
    orgStats: { averagePower: 0, maxPower: 0, totalOrgPower: 0, userRank: 0,
      membershipPercent: membership.reduce((sum, c) => sum + c.contributionToTotalPct, 0),
      contributionPercent: contribution.reduce((sum, c) => sum + c.contributionToTotalPct, 0),
      percentOfTotal, aboveAverage: false },
    isHybrid, hasVotingPower: hasMemberRole && (!isHybrid || classBreakdown?.some(c => c.eligible) === true),
    status: breakdownStatus,
    message: breakdownStatus === 'loading' ? 'Loading...' : !hasMemberRole ? 'Join to participate in voting' : isHybrid ? `Your voice: ${democracy}% membership + ${contributionWeight}% contribution` : 'Equal voice with all members',
    classConfig, isLoading: Boolean(votingLoading) || identityPending, classBreakdown, totalSharePct, breakdownStatus, hasRealClasses, votingType,
  };
}

export default useVotingPower;
