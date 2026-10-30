import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
const state = vi.hoisted(() => ({ roles: [{ hatId: '1', name: 'Members' }], error: null, matrix: null }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra());
vi.mock('@/hooks/useOrgStructure', () => ({ useOrgStructure: () => ({ roles: state.roles, error: state.error }) }));
vi.mock('@/components/orgStructure/PermissionsMatrix', () => ({ PermissionsMatrix: props => { state.matrix = props; return null; } }));
import ProjectInfoModal from '@/components/TaskManager/ProjectInfoModal';
const render = project => renderToStaticMarkup(<ProjectInfoModal isOpen project={{ columns: [], ...project }} />);
it('renders unavailable project-context facts rather than a no-grants message, including an empty unavailable roster', () => {
  const html = render({ permissionsAvailable: true, rolePermissions: [{ hatId: '1', resolved: true, permissionFact: unknownFact('Unavailable') }] });
  expect(html).toContain('Some current permissions are unavailable');
  expect(html).not.toContain('No role permissions are currently granted');
  expect(state.matrix.roles).toHaveLength(1);
  expect(state.matrix.permissionsMatrix['1'].TaskManager_Create).toBeNull();
  state.roles = []; state.error = new Error('Mock unavailable');
  expect(render({ permissionsAvailable: false })).toContain('Some current permissions are unavailable');
  state.roles = [{ hatId: '1', name: 'Members' }]; state.error = null;
});
it('keeps an explicit known zero project override distinct from an unavailable grant', () => {
  const html = render({ permissionsAvailable: true, rolePermissions: [{ hatId: '1', resolved: true, permissionFact: knownFact('0') }],
    globalRolePermissions: [{ hatId: '1', mask: '255' }] });
  expect(html).toContain('No role permissions are currently granted');
  expect(html).not.toContain('Some current permissions are unavailable');
});
