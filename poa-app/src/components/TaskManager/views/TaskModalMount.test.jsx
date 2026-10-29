import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const host = vi.hoisted(() => ({ toast: vi.fn(), edit: vi.fn(), metadata: vi.fn() }));
vi.mock('react', async original => ({ ...await original(), useMemo: fn => fn() }));
vi.mock('next/dynamic', () => ({ default: () => props => { host.modal = props; return null; } }));
vi.mock('@chakra-ui/react', () => ({ useToast: () => host.toast }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: { task: 'task-37', projectId: 'project-17' } }) }));
vi.mock('@/context/dataBaseContext', () => ({ useDataBaseContext: () => ({ selectedProject: { id: 'project-17' } }) }));
vi.mock('@/context/TaskBoardContext', () => ({ useTaskBoard: () => ({
  taskColumns: [{ id: 'open', tasks: [{ id: 'other', projectId: 'project-17' }, { id: 'task-37', projectId: 'project-17' }] }],
  editTask: host.edit, editTaskMetadata: host.metadata,
}) }));

import TaskModalMount from '@/components/TaskManager/views/TaskModalMount';

beforeEach(() => { vi.clearAllMocks(); renderToStaticMarkup(TaskModalMount()); });

it.each(['onEditTask', 'onEditTaskMetadata'])('%s preserves provider arguments and blocked/failed/successful results without an extra success notification', async callback => {
  const provider = callback === 'onEditTask' ? host.edit : host.metadata;
  const updated = { id: 'task-37', title: 'Edited title', description: 'Preserved description',
    difficulty: 2, estHours: '1.5', bounty: '9007199254740993001', deadline: '2100000000' };
  for (const result of [undefined, { success: false, blocked: true }, { success: false, error: 'failed' }, { success: true, receipt: {} }]) {
    provider.mockResolvedValueOnce(result);
    await expect(host.modal[callback](updated)).resolves.toBe(result);
    expect(provider).toHaveBeenLastCalledWith(updated, 'open', 1);
    expect(host.toast).not.toHaveBeenCalled();
  }
});

it.each(['onEditTask', 'onEditTaskMetadata'])('%s propagates provider rejection without announcing success', async callback => {
  const provider = callback === 'onEditTask' ? host.edit : host.metadata;
  const error = new Error('Current task changed');
  provider.mockRejectedValueOnce(error);
  await expect(host.modal[callback]({ id: 'task-37' })).rejects.toBe(error);
  expect(host.toast).not.toHaveBeenCalled();
});
