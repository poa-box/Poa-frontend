import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveTokenLabel } from '@/util/tokenLabel';
import AddTaskModal from '@/components/TaskManager/AddTaskModal';
import EditTaskModal from '@/components/TaskManager/EditTaskModal';
import ExampleTaskModal from '@/components/TaskManager/ExampleTaskModal';

const state = vi.hoisted(() => ({ label: undefined, actions: [] }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra(state.actions));
vi.mock('@chakra-ui/icons', () => ({ InfoIcon: () => null, CloseIcon: () => null, ExternalLinkIcon: () => null }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ tokenLabel: state.label, orgChainId: 100 }) }));
vi.mock('@/components/common', () => ({ UserSearchInput: () => null }));
vi.mock('@/components/common/UserIdentity', () => ({ default: () => null }));
vi.mock('@/hooks/useTaskDrafts', () => ({ useKeepFieldsPref: () => [false, vi.fn()] }));
vi.mock('@/components/TaskManager/DeadlineFields', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/EstTimePicker', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/DraftRow', () => ({ default: () => null }));

describe('task forms/dialogs/previews honor organization reward labels', () => {
  it.each([
    [undefined, 'Shares'], [resolveTokenLabel({ useTokenSymbol: false, symbol: 'MiXeD' }), 'Shares'],
    [resolveTokenLabel({ useTokenSymbol: true, symbol: 'MiXeD' }), 'MiXeD'],
    [resolveTokenLabel({ useTokenSymbol: true, symbol: '' }), 'Shares'],
    [resolveTokenLabel({ useTokenSymbol: true }), 'Shares'],
  ])('keeps %s in creation, editing and the tour preview', (label, expected) => {
    state.label = label;
    const props = { isOpen: true, onClose() {}, onAddTask() {}, onEditTask() {} };
    const add = renderToStaticMarkup(React.createElement(AddTaskModal, props));
    const edit = renderToStaticMarkup(React.createElement(EditTaskModal, { ...props,
      task: { name: 'Work', description: '', difficulty: 'easy', estHours: 1,
        bountyToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', bountyPayout: '1.00', bountyPayoutRaw: '1000001', bountyPayoutExact: '1.000001' } }));
    const preview = renderToStaticMarkup(React.createElement(ExampleTaskModal, { ...props, tokenLabel: label }));
    expect(add).toContain(expected);
    expect(edit).toContain(expected);
    expect(preview).toContain(`10 ${expected}`);
    if (expected === 'MiXeD') {
      expect(add).not.toContain('mixed');
      expect(edit).not.toContain('mixed');
    }
  });
  it('keeps the exact saved bounty and an unchanged hard deadline when only editing a title', () => {
    state.actions.length = 0;
    const onEditTask = vi.fn();
    const absoluteDeadline = 2100000123;
    const task = { name: 'Work', description: '', difficulty: 'easy', estHours: 1,
      bountyToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', bountyPayoutRaw: '1000001',
      bountyPayout: '1.00', bountyPayoutExact: '1.000001', absoluteDeadline, completionWindow: 1800 };
    renderToStaticMarkup(React.createElement(EditTaskModal, { isOpen: true, onClose() {}, onEditTask, task }));
    const save = state.actions.find(action => String(action.children).includes('Save'));
    expect(save?.onClick).toBeTypeOf('function');
    save.onClick();
    expect(onEditTask.mock.calls[0][0]).toMatchObject({ bountyAmount: '1.000001', absoluteDeadline, completionWindow: 1800 });
  });
});
