import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';

const f = vi.hoisted(() => ({ taskId: '', account: '', hoursOnly: true, generation: '', badges: [],
  getMetadata: vi.fn(), fetch: vi.fn(), push: vi.fn(), toast: vi.fn() }));
vi.mock('@chakra-ui/react', async () => {
  const chakra = (await import('@/test/parityHost')).parityChakra(f.toast);
  chakra.Badge = function MetadataBadge({ children }) { f.badges.push({ generation: f.generation, text: String(children) }); return <span>{children}</span>; };
  return chakra;
});
vi.mock('@/components/TaskManager/EditTaskModal', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/TaskApplicationModal', () => ({ default: () => null }));
vi.mock('@/components/common', () => ({ UserSearchInput: () => null }));
vi.mock('@/components/common/UserIdentity', () => ({ default: () => null }));
vi.mock('@/components/common/UsernameLink', () => ({ default: () => null }));
vi.mock('@/context/TaskBoardContext', () => ({ useTaskBoard: () => ({ getTaskMetadata: f.getMetadata }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ userData: {}, fetchUserDetails: vi.fn() }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: f.account }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgId: 'Test6', orgChainId: 100,
  subgraphUrl: 'https://metadata.invalid/graphql', tokenLabel: 'Shares', taskPayoutHoursOnly: f.hoursOnly }) }));
vi.mock('@/context/dataBaseContext', () => ({ useDataBaseContext: () => ({ projects: [] }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ safeFetchFromIpfs: f.fetch }) }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectsData: [], releasesSupported: true,
  getTaskActions: () => Object.fromEntries(['claim', 'apply', 'submit', 'complete', 'reject', 'assign', 'editFull', 'editMetadata', 'release', 'cancel']
    .map(action => [action, { state: 'denied', reasons: [] }])) }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: { task: f.taskId }, push: f.push }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useNow', () => ({ useNow: () => 2000000 }));
vi.mock('@/hooks/useShareLink', () => ({ useShareLink: () => '/task' }));
import TaskCardModal from '@/components/TaskManager/TaskCardModal';

const TM = `0x${'12'.repeat(20)}`, ACCOUNT = `0x${'34'.repeat(20)}`, HASH = `0x${'ab'.repeat(32)}`, NEXT_HASH = `0x${'cd'.repeat(32)}`;
const task = { id: `${TM}-39`, projectId: `${TM}-${'0x' + '01'.repeat(32)}`, status: 'Open', name: 'Fresh verification task',
  metadataHash: HASH, description: null, difficulty: 'medium', estHours: 1, submission: '', payout: '3', Payout: '3',
  claimedBy: '', absoluteDeadline: 0, claimDeadline: 0, completionWindow: 0, requiresApplication: false };
const document = { name: task.name, description: 'Verified saved details', difficulty: 'easy', estHours: 0.25, submission: '' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const badges = generation => f.badges.filter(row => row.generation === generation).map(row => row.text);
let host;
beforeEach(() => {
  vi.clearAllMocks(); f.taskId = task.id; f.account = ACCOUNT; f.hoursOnly = true; f.generation = 'first'; f.badges = [];
  f.fetch.mockResolvedValue(null); f.getMetadata.mockResolvedValue(document); f.push.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); host = createParityHost();
});
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('mounted task metadata presentation', () => {
  it('shows verified Easy/15m instead of medium/1h board defaults without changing the recorded reward', async () => {
    await host.render(<TaskCardModal task={task} columnId="open" />);
    expect(host.container.textContent).toContain(document.description);
    expect(badges('first').slice(-2)).toEqual(['easy', '15m']);
    expect(host.container.textContent).toContain('3'); expect(task).toMatchObject({ difficulty: 'medium', estHours: 1, payout: '3' });
  });
  it('preserves verified zero hours and deliberate indexed empty description/submission', async () => {
    f.getMetadata.mockResolvedValue({ ...document, estHours: 0, description: 'Do not replace the indexed empty description', submission: 'Do not replace the indexed empty submission' });
    await host.render(<TaskCardModal task={{ ...task, description: '', submission: '' }} columnId="open" />);
    expect(badges('first').slice(-2)).toEqual(['easy', '0m']);
    expect(host.container.textContent).not.toContain('Do not replace');
  });
  it.each(['task', 'hash', 'account'])('never renders a prior document during a %s switch, including before reset effects', async change => {
    await host.render(<TaskCardModal task={task} columnId="open" />);
    const next = deferred(); f.getMetadata.mockReturnValue(next.promise); f.generation = 'next';
    const changed = change === 'task' ? { ...task, id: `${TM}-40` } : change === 'hash' ? { ...task, metadataHash: NEXT_HASH } : task;
    if (change === 'account') f.account = `0x${'56'.repeat(20)}`;
    f.taskId = changed.id;
    await host.render(<TaskCardModal task={changed} columnId="open" />);
    expect(badges('next')).not.toContain('easy'); expect(badges('next')).not.toContain('15m');
    expect(host.container.textContent).not.toContain(document.description);
    await act(async () => { next.resolve({ ...document, description: 'New verified details', difficulty: 'hard', estHours: 2.5 }); });
    expect(badges('next').slice(-2)).toEqual(['hard', '2h 30m']); expect(host.container.textContent).toContain('New verified details');
  });
  it.each(['task', 'hash'])('ignores late canonical metadata from the previous %s after the new document resolves', async change => {
    const old = deferred(), next = deferred(); f.getMetadata.mockReturnValueOnce(old.promise).mockReturnValue(next.promise);
    await host.render(<TaskCardModal task={task} columnId="open" />);
    const changed = change === 'task' ? { ...task, id: `${TM}-40` } : { ...task, metadataHash: NEXT_HASH };
    f.taskId = changed.id; f.generation = 'next';
    await host.render(<TaskCardModal task={changed} columnId="open" />);
    await act(async () => { next.resolve({ ...document, description: 'Current document', difficulty: 'hard', estHours: 2 }); });
    await act(async () => { old.resolve({ ...document, description: 'Stale document' }); });
    expect(host.container.textContent).toContain('Current document'); expect(host.container.textContent).not.toContain('Stale document');
    expect(badges('next').slice(-2)).toEqual(['hard', '2h']);
  });
  it('does not let a late raw fallback replace canonical verified metadata for the same pointer', async () => {
    const raw = deferred(), canonical = deferred(); f.fetch.mockReturnValue(raw.promise); f.getMetadata.mockReturnValue(canonical.promise);
    await host.render(<TaskCardModal task={task} columnId="open" />);
    await act(async () => { canonical.resolve(document); });
    expect(host.container.textContent).toContain(document.description);
    expect(host.container.textContent).not.toContain('Loading task details...');
    await act(async () => { raw.resolve({ ...document, difficulty: 'hard', estHours: 8, description: 'Late fallback' }); });
    expect(badges('first').slice(-2)).toEqual(['easy', '15m']); expect(host.container.textContent).not.toContain('Late fallback');
    expect(host.container.textContent).toContain(document.description);
  });
  it('keeps an indexed description visible while submission metadata is pending', async () => {
    const raw = deferred(), canonical = deferred(); f.fetch.mockReturnValue(raw.promise); f.getMetadata.mockReturnValue(canonical.promise);
    await host.render(<TaskCardModal task={{ ...task, status: 'Submitted', description: 'Indexed saved details',
      submission: null, submissionHash: NEXT_HASH }} columnId="inReview" />);
    expect(host.container.textContent).toContain('Indexed saved details');
    expect(host.container.textContent).not.toContain('Loading task details...');
    expect(host.container.textContent).toContain('Loading submission...');
    await act(async () => { raw.resolve({ submission: 'Saved submission' }); });
    expect(host.container.textContent).toContain('Saved submission');
  });
  it('does not let a cancelled old read clear the next pointer loading state', async () => {
    const rawOld = deferred(), rawNext = deferred(), canonicalOld = deferred(), canonicalNext = deferred();
    f.fetch.mockReturnValueOnce(rawOld.promise).mockReturnValue(rawNext.promise);
    f.getMetadata.mockReturnValueOnce(canonicalOld.promise).mockReturnValue(canonicalNext.promise);
    await host.render(<TaskCardModal task={task} columnId="open" />);
    await host.render(<TaskCardModal task={{ ...task, metadataHash: NEXT_HASH }} columnId="open" />);
    await act(async () => { rawOld.resolve(document); canonicalOld.resolve(document); });
    expect(host.container.textContent).toContain('Loading task details...');
    expect(host.container.textContent).not.toContain(document.description);
    await act(async () => { canonicalNext.resolve({ ...document, description: 'Current pointer details' }); });
    expect(host.container.textContent).toContain('Current pointer details');
    expect(host.container.textContent).not.toContain('Loading task details...');
    await act(async () => { rawNext.resolve(null); });
    expect(host.container.textContent).toContain('Current pointer details');
  });
  it('recognizes estimatedHours only as the legacy fallback alias when canonical metadata is unavailable', async () => {
    f.getMetadata.mockRejectedValue(new Error('Saved details unavailable'));
    f.fetch.mockResolvedValue({ description: 'Fallback details', difficulty: 'easy', estimatedHours: 0.25 });
    await host.render(<TaskCardModal task={task} columnId="open" />);
    expect(badges('first').slice(-2)).toEqual(['easy', '15m']);
    expect(host.button('Edit')).toBeUndefined();
  });
});
