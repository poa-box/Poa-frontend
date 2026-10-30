import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { resolveTokenLabel } from '@/util/tokenLabel';
import { PermissionsMatrix } from '@/components/orgStructure/PermissionsMatrix';

const state = vi.hoisted(() => ({ tokenLabel: undefined }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => state }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra());
const roles = [{ hatId: '1', name: 'Members', memberCount: 2 }];
const columns = [
  { key: 'ParticipationToken_Member', permissionRole: 'Member' },
  { key: 'TaskManager_Create', permissionRole: 'Create' },
  { key: 'TaskManager_Review', permissionRole: 'Review' },
  { key: 'TaskManager_Budget', permissionRole: 'Budget' },
];

describe('permission display preserves unknown facts on desktop and mobile', () => {
  it('distinguishes unavailable, inherited, allowed and denied cells', () => {
    const markup = renderToStaticMarkup(<PermissionsMatrix roles={roles} permissionColumns={columns}
      permissionsMatrix={{ 1: { ParticipationToken_Member: null, TaskManager_Create: true,
        TaskManager_Review: false, TaskManager_Budget: 'inherited' } }} />);
    expect(markup).toContain('Shares: Permission unavailable');
    expect(markup).toContain('Task Create: Allowed');
    expect(markup).toContain('Task Review: Not allowed');
    expect(markup).toContain('Task Budget: Inherited from a group');
    expect(markup.match(/aria-label="Permission unavailable"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Not allowed"/g)).toHaveLength(2);
  });

  it('leaves absent and unrecognized values unknown instead of promoting their truthiness', () => {
    const markup = renderToStaticMarkup(<PermissionsMatrix roles={roles} permissionColumns={columns}
      permissionsMatrix={{ 1: { TaskManager_Create: 'unknown' } }} />);
    expect(markup).not.toContain('aria-label="Allowed"');
    expect(markup).not.toContain('aria-label="Not allowed"');
    expect(markup.match(/aria-label="Permission unavailable"/g)).toHaveLength(8);
  });

  it.each([
    [{}, 'Shares'], [{ useTokenSymbol: false, symbol: 'MiXeD' }, 'Shares'],
    [{ useTokenSymbol: true, symbol: 'MiXeD' }, 'MiXeD'],
    [{ useTokenSymbol: true, symbol: '' }, 'Shares'], [{ useTokenSymbol: true }, 'Shares'],
  ])('uses the configured ownership label in column headings and descriptions: %j', (configuration, expected) => {
    state.tokenLabel = resolveTokenLabel(configuration);
    const markup = renderToStaticMarkup(<PermissionsMatrix roles={roles} permissionColumns={[columns[0]]}
      permissionsMatrix={{ 1: { ParticipationToken_Member: true } }} />);
    expect(markup).toContain(`${expected}: Allowed`);
    expect(markup).toContain(`Request and hold ${expected} for tasks and contributions.`);
    expect(markup).not.toMatch(/on-chain|org token/);
    state.tokenLabel = undefined;
  });


});
