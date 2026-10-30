import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVotingPower } from '@/hooks/useVotingPower';
const state = vi.hoisted(() => ({ po: {}, user: {}, voting: {}, auth: {} }));
vi.mock('react', async importOriginal => ({ ...await importOriginal(), useMemo: compute => compute() }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => state.po }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => state.user }));
vi.mock('@/context/VotingContext', () => ({ useVotingContext: () => state.voting }));
vi.mock('@/context/authState', () => ({ useAuth: () => state.auth }));
const asset = '0x1111111111111111111111111111111111111111';
beforeEach(() => {
  state.auth = { isAuthHydrated: true };
  state.user = { hasMemberRole: true, userDataLoading: false,
    userData: { hatIds: [], participationTokenBalance: '0', participationTokenBalanceWei: '1' } };
  state.po = { participationTokenAddress: asset, poMembers: 2, leaderboardData: [
    { participationTokenBalanceWei: '1', hatIds: [] }, { participationTokenBalanceWei: '3', hatIds: [] },
  ] };
  state.voting = { votingType: 'Hybrid', loading: false, votingClasses: [
    { classIndex: 0, strategy: 'ERC20_BAL', slicePct: 100, minBalance: '1', asset, quadratic: false, hatIds: [] },
  ] };
});
describe('voting power hook host shape', () => {
  it('uses exact raw inputs despite rounded display zero and retains the N-class receipt fields', () => {
    const result = useVotingPower();
    expect(result.hasVotingPower).toBe(true);
    expect(result.classBreakdown[0].userRawPowerExact).toBe('100');
    expect(result.totalSharePct).toBe(25);
    expect(result.classWeights).toEqual({ democracy: 0, contribution: 100 });
    expect(result.breakdownStatus).toBe('ready');
  });
  it('keeps the share unknown until raw electorate balances arrive', () => {
    state.po.leaderboardData = [{ token: '0', hatIds: [] }];
    expect(useVotingPower().totalSharePct).toBeNull();
    expect(useVotingPower().classBreakdown[0].shareKnown).toBe(false);
  });
  it('does not invent default class facts while actual configuration is unresolved', () => {
    state.voting.votingClasses = [];
    const result = useVotingPower();
    expect(result.classBreakdown).toBeNull();
    expect(result.classConfig).toBeNull();
    expect(result.status).toBe('loading');
  });
  it('treats unresolved restored identity as loading before a nonmember answer', () => {
    state.auth.isAuthHydrated = false;
    state.user.hasMemberRole = false;
    const result = useVotingPower();
    expect(result.status).toBe('loading');
    expect(result.message).toBe('Loading...');
    expect(result.isLoading).toBe(true);
  });
});
