import { describe, expect, it, vi, beforeEach } from 'vitest';
import { utils } from 'ethers';
import { useVoteActions } from '@/hooks/useVoteActions';
const host = vi.hoisted(() => ({
  voting: { castVote: vi.fn(), announceWinner: vi.fn() }, addNotification: vi.fn(),
  executeWithNotification: vi.fn(async transaction => transaction()),
}));
vi.mock('react', async importOriginal => ({ ...await importOriginal(), useCallback: callback => callback }));
vi.mock('@/hooks/useWeb3Services', () => ({
  useWeb3Services: () => ({ voting: host.voting }),
  useTransactionWithNotification: () => ({ executeWithNotification: host.executeWithNotification }),
}));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: { PROPOSAL_VOTED: 'proposal:voted', PROPOSAL_COMPLETED: 'proposal:completed' } }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: host.addNotification }) }));
const contract = '0x1111111111111111111111111111111111111111';
const id = '90071992547409931234567890';
const events = new utils.Interface(['event ProposalExecutionFailed(uint256 indexed id, uint256 indexed winningIdx, bytes reason)']);
const failure = proposalId => ({ address: contract, ...events.encodeEventLog(events.getEvent('ProposalExecutionFailed'), [proposalId, 0, '0x']) });

beforeEach(() => vi.clearAllMocks());
describe('host voting notifications survive core migration', () => {
  it('returns the opaque cast result and preserves the selected poll lane and refresh lifecycle', async () => {
    const result = { success: true, receipt: {}, hostOnly: true };
    host.voting.castVote.mockResolvedValue(result);
    const actions = useVoteActions('Direct Democracy');
    expect(await actions.handleVote(contract, id, [1], [100])).toBe(result);
    expect(host.voting.castVote).toHaveBeenCalledWith('dd', contract, id, [1], [100]);
    expect(host.executeWithNotification.mock.calls[0][1]).toMatchObject({ refreshEvent: 'proposal:voted' });
  });
  it('warns about exact inner failure while returning the successful count result unchanged', async () => {
    const result = { success: true, receipt: { logs: [failure(id)] }, hostOnly: true };
    host.voting.announceWinner.mockResolvedValue(result);
    expect(await useVoteActions('Hybrid').handleFinalize(contract, id, true)).toBe(result);
    expect(host.addNotification).toHaveBeenCalledWith(expect.stringContaining('ran out of gas'), 'error');
    expect(host.executeWithNotification.mock.calls[0][1]).toMatchObject({ refreshEvent: 'proposal:completed' });
  });
  it('ignores another proposal’s inner failure and never interprets a failed send as a successful count', async () => {
    host.voting.announceWinner.mockResolvedValue({ success: true, receipt: { logs: [failure('1')] } });
    await useVoteActions('Hybrid').handleFinalize(contract, id, true);
    expect(host.addNotification).not.toHaveBeenCalled();
    const failed = { success: false, receipt: { logs: [failure(id)] } };
    host.voting.announceWinner.mockResolvedValue(failed);
    expect(await useVoteActions('Hybrid').handleFinalize(contract, id, true)).toBe(failed);
    expect(host.addNotification).not.toHaveBeenCalled();
  });
});
