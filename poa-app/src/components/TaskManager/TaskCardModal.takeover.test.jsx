import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ buttons: [], username: 'current_member', allowed: true, takeOver: vi.fn(), push: vi.fn(), toast: vi.fn() }));
vi.mock('@chakra-ui/react', async () => {
  const chakra = (await import('@/test/mockChakra')).mockChakra(fixture.buttons);
  chakra.useToast = () => fixture.toast;
  return chakra;
});
vi.mock('@/components/TaskManager/EditTaskModal', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/TaskApplicationModal', () => ({ default: () => null }));
vi.mock('@/components/common', () => ({ UserSearchInput: () => null }));
vi.mock('@/components/common/UserIdentity', () => ({ default: () => null }));
vi.mock('@/components/common/UsernameLink', () => ({ default: () => null }));
vi.mock('@/context/TaskBoardContext', () => ({ useTaskBoard: () => ({ takeOverTask: fixture.takeOver }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ userData: { username: fixture.username }, fetchUserDetails: vi.fn() }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: `0x${'11'.repeat(20)}` }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgChainId: 100, tokenLabel: 'Shares' }) }));
vi.mock('@/context/dataBaseContext', () => ({ useDataBaseContext: () => ({ projects: [] }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ safeFetchFromIpfs: vi.fn() }) }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectsData: [], releasesSupported: true,
  getTaskActions: () => Object.fromEntries(['claim', 'apply', 'complete', 'reject', 'assign', 'editFull', 'editMetadata', 'release', 'cancel'].map(action => [action, { reasons: [], state: action === 'claim' && fixture.allowed ? 'allowed' : 'denied' }])) }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: { task: '7', projectId: 'project', view: 'list', q: 'saved' }, push: fixture.push }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useNow', () => ({ useNow: () => 2100000000000 }));
vi.mock('@/hooks/useShareLink', () => ({ useShareLink: () => '/task' }));
import TaskCardModal from '@/components/TaskManager/TaskCardModal';
const task = { id: '7', name: 'Expired task', projectId: 'project', status: 'Assigned', claimedBy: `0x${'22'.repeat(20)}`, claimDeadline: 2000000000, absoluteDeadline: 0, completionWindow: 60, payout: '1' };
beforeEach(() => { fixture.buttons.length = 0; fixture.username = 'current_member'; fixture.allowed = true; fixture.takeOver.mockReset().mockResolvedValue({ success: true }); fixture.push.mockReset().mockResolvedValue(true); fixture.toast.mockClear(); });
describe('actual task takeover button callback', () => {
  it.each(['current_member', undefined])('passes current display username %s after preserving board navigation', async username => {
    fixture.username = username;
    renderToStaticMarkup(<TaskCardModal task={task} columnId="inProgress" />);
    await fixture.buttons.find(button => button.children === 'Take over task').onClick();
    expect(fixture.takeOver).toHaveBeenCalledExactlyOnceWith(task, `0x${'11'.repeat(20)}`, username || '');
    expect(fixture.push.mock.calls[0][0].query).toMatchObject({ view: 'list', q: 'saved', org: 'Test6', projectId: 'project' });
    expect(fixture.push.mock.calls[0][0].query).not.toHaveProperty('task');
  });
  it('does not use the display username as permission evidence', async () => {
    fixture.allowed = false;
    renderToStaticMarkup(<TaskCardModal task={task} columnId="inProgress" />);
    await fixture.buttons.find(button => button.children === 'Take over task').onClick();
    expect(fixture.takeOver).not.toHaveBeenCalled();
    expect(fixture.push).not.toHaveBeenCalled();
    expect(fixture.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Membership Required' }));
  });
});
