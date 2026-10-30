import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TaskWorkspace from '@/components/TaskManager/TaskWorkspace';
import EditBudgetModal from '@/components/TaskManager/EditBudgetModal';

const state = vi.hoisted(() => ({ projectsError: null, projectsLoading: false, actions: [], retry: null }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra(state.actions));
vi.mock('@/components/TaskManager/MainLayout', () => ({ default: () => <div>Resolved task board</div> }));
vi.mock('@/components/TaskManager/views/lazyTaskViews', () => ({ preloadInitialTaskView() {} }));
vi.mock('@/components/TaskManager/DeferredProjectSidebar', () => ({ preloadDesktopTaskSidebar() {} }));
vi.mock('@/components/shared/CommunityLoadingState', () => ({ default: () => <div>Loading tasks</div> }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/hooks/useTaskRoute', () => ({ useTaskRoute() {} }));
vi.mock('@/hooks/useOrgTheme', () => ({ useOrgTheme: () => ({ pageBackground: () => 'black' }) }));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectsError: state.projectsError,
  projectsLoading: state.projectsLoading, projectsData: [], refetchProjects: state.retry,
  getTaskActions: () => ({ budget: { state: 'allowed' } }) }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgChainId: 100, taskManagerContractAddress: `0x${'12'.repeat(20)}` }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: `0x${'34'.repeat(20)}`, isAuthHydrated: true }) }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3: () => ({ task: null, isReady: false }) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: { PROJECT_BUDGET_UPDATED: 'project:budget' } }));

beforeEach(() => { state.actions.length = 0; state.projectsError = null; state.projectsLoading = false; state.retry = vi.fn(); });
describe('host unknown/error states remain different from empty or zero', () => {
  it('shows a retryable read failure rather than an empty board, and retains a known empty success', () => {
    state.projectsError = new Error('Mock unavailable');
    const failed = renderToStaticMarkup(React.createElement(TaskWorkspace));
    expect(failed).toContain('Projects could not finish loading');
    expect(failed).not.toContain('Resolved task board');
    state.actions.find(action => action.children === 'Try again').onClick();
    expect(state.retry).toHaveBeenCalledTimes(1);
    state.projectsError = null;
    expect(renderToStaticMarkup(React.createElement(TaskWorkspace))).toContain('Resolved task board');
  });
  it('keeps loading unresolved and unpopulated budget spends unknown', () => {
    state.projectsLoading = true;
    expect(renderToStaticMarkup(React.createElement(TaskWorkspace))).toContain('Loading tasks');
    const project = { id: `0x${'12'.repeat(20)}-0x${'01'.repeat(32)}`, cap: '1000000000000000000', spent: '0',
      bountyCaps: [{ token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', cap: '1000000', spent: '0' }] };
    const markup = renderToStaticMarkup(React.createElement(EditBudgetModal, { isOpen: true, onClose() {}, project }));
    expect(markup).toContain('— Shares');
    expect(markup).toContain('Spent: —');
  });
});
