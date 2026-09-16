import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CreateProjectModal from '@/components/TaskManager/CreateProjectModal';
import { resolveTokenLabel } from '@/util/tokenLabel';

const state = vi.hoisted(() => ({ tokenLabel: undefined, tooltips: [] }));
vi.mock('@chakra-ui/react', async () => {
  const chakra = (await import('@/test/mockChakra')).mockChakra();
  chakra.Tooltip = ({ children, label }) => { state.tooltips.push(label); return children; };
  return chakra;
});
vi.mock('@chakra-ui/icons', () => ({ AddIcon: () => null, InfoIcon: () => null, ChevronRightIcon: () => null }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ tokenLabel: state.tokenLabel }) }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ globalRolePermissions: [] }) }));
vi.mock('@/features/deployer/utils/usernameResolver', () => ({ resolveUsernames: vi.fn() }));
vi.mock('@/util/tokens', () => ({ getBountyTokenOptions: () => [] }));
vi.mock('@/services/web3/utils/publicChainClient', () => ({ createPublicClientForChain: vi.fn() }));

beforeEach(() => { state.tooltips = []; });

describe('project creation ownership labels', () => {
  it.each([
    [undefined, 'Shares'],
    [resolveTokenLabel({ useTokenSymbol: false, symbol: 'MiXeD' }), 'Shares'],
    [resolveTokenLabel({ useTokenSymbol: true, symbol: 'MiXeD' }), 'MiXeD'],
    [resolveTokenLabel({ useTokenSymbol: true, symbol: '' }), 'Shares'],
  ])('renders configured labels without changing case: %s', (label, expected) => {
    state.tokenLabel = label;
    const markup = renderToStaticMarkup(React.createElement(CreateProjectModal, { isOpen: true, onClose() {}, onCreateProject() {} }));
    expect(markup).toContain(`${expected} Budget Cap`);
    expect(state.tooltips).toContain(`Set a maximum amount of ${expected} this project can allocate to tasks. Leave unchecked for unlimited.`);
    expect(markup).toContain('current task permissions');
  });
});
