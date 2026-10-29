import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ creator: null, allowed: true, remove: null, notify: null, toast: null, delete: null, actions: [], open: null }));
vi.mock('@chakra-ui/react', async () => { const chakra = (await import('@/test/mockChakra')).mockChakra(state.actions); chakra.useToast = () => state.toast; return chakra; });
vi.mock('@/components/TaskManager/TaskDragProvider', () => ({ default: ({ children }) => children }));
vi.mock('@/components/TaskManager/DraggableProject', () => ({ default: props => { state.delete = props.onDeleteProject; return null; } }));
vi.mock('@/components/TaskManager/FolderedProjectList', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/TrashBin', () => ({ default: () => null }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3: () => ({ task: { deleteProject: state.remove }, executeWithNotification: state.notify, isReady: true }) }));
vi.mock('@/context/dataBaseContext', () => ({ useDataBaseContext: () => ({}) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ userData: { hatIds: ['legacy'] } }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: '0x' + '2'.repeat(40) }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ taskManagerContractAddress: '0x' + '1'.repeat(40), orgId: 'org', subgraphUrl: 'https://offline.test', orgChainId: 100, creatorHatIds: ['legacy'] }) }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectsData: [{ id: 'project', columns: [] }], projectCreator: state.creator,
  assertProjectCreator: () => { if (!state.creator?.value) throw new Error('Unavailable'); },
  getTaskActions: () => ({ deleteProject: { state: state.allowed ? 'allowed' : 'unknown' } }) }) }));
import ProjectSidebar from '@/components/TaskManager/ProjectSidebar';
const render = () => renderToStaticMarkup(<ProjectSidebar projects={[{ id: 'project', name: 'A project' }]} selectedProject="project" onOpenCreateModal={state.open} />);
beforeEach(() => { state.actions.length = 0; state.open = vi.fn(); state.creator = { state: 'unknown' }; state.allowed = true; state.remove = vi.fn(async () => ({ success: true })); state.notify = vi.fn(async fn => fn()); state.toast = vi.fn(); });
it('uses the core-derived creator gate rather than the matching historical role arrays', () => {
  render(); state.actions.findLast(action => action.children === 'Create Project').onClick();
  expect(state.open).not.toHaveBeenCalled(); expect(state.toast).toHaveBeenCalled();
  state.creator = { state: 'known', value: true };
  render(); state.actions.findLast(action => action.children === 'Create Project').onClick();
  expect(state.open).toHaveBeenCalledOnce();
});
it('uses the delete policy at invocation and rechecks it immediately before the service boundary', async () => {
  render(); await state.delete('project');
  expect(state.remove).toHaveBeenCalledWith('0x' + '1'.repeat(40), 'project', { assertCurrent: expect.any(Function) });
  state.remove.mockClear(); state.notify.mockImplementation(async fn => { state.allowed = false; return fn(); });
  await expect(state.delete('project')).rejects.toThrow('Project permissions changed');
  expect(state.remove).not.toHaveBeenCalled();
  await state.delete('project'); expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'warning' }));
});
