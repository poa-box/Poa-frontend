import { beforeEach, describe, it, expect, vi } from 'vitest';
import { deployerReducer, initialState, ACTION_TYPES } from '@/features/deployer/context/deployerReducer';
import { TEMPLATE_IDS, getTemplateDefaults } from '@/features/deployer/templates/templateDefinitions';
import { getRichTemplateById } from '@/features/deployer/templates';
import { validateDeploymentConfig, createDeploymentConfig } from '@/features/deployer/utils/deploymentMapper';
import { validateDeployerState } from '@/features/deployer/validation/schemas';
import { validateOrgDeployConfig } from '@poa-box/core/tx/org';
import { toCoreDeployConfig } from '@/lib/deployment/coreDeployment';

const founder = '0x1111111111111111111111111111111111111111';
const registry = '0x2222222222222222222222222222222222222222';
const identity = state => ({ ...state, organization: { ...state.organization,
  name: 'Together', description: 'Work together with care and shared ownership', username: 'founder' } });
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); });

describe('maintained native presets use the actual wizard defaults', () => {
  it.each(Object.values(TEMPLATE_IDS))('%s validates and assembles without role repairs', id => {
    const defaults = getTemplateDefaults(id);
    const state = identity(deployerReducer(structuredClone(initialState), { type: ACTION_TYPES.APPLY_TEMPLATE, payload: defaults }));
    expect(validateDeployerState(state).isValid).toBe(true);
    expect(validateDeploymentConfig(state)).toEqual({ isValid: true, errors: [] });
    const config = toCoreDeployConfig(state, founder);
    expect(() => validateOrgDeployConfig(config)).not.toThrow();
    const { params } = createDeploymentConfig(state, founder, { registryAddress: registry });
    params.roles.forEach((role, index) => {
      expect(role.vouching.quorum).toBe(defaults.roles[index].vouching.quorum);
      expect(role.vouching.voucherRoleIndex.toString()).toBe(String(defaults.roles[index].vouching.voucherRoleIndex));
      expect(role).not.toHaveProperty('hierarchy');
      expect(role).not.toHaveProperty('defaults');
      expect(role).not.toHaveProperty('hatConfig');
    });
    expect(params.ddInitialTargets).toEqual([]);
    if (id === TEMPLATE_IDS.CUSTOM) {
      expect(params.roleAssignments.quickJoinRolesBitmap.toString()).toBe('1');
      expect(params.roles.map(role => role.open)).toEqual([true, false]);
    } else {
      expect(params.roleAssignments.quickJoinRolesBitmap.toString()).toBe('0');
      expect(params.roles.every(role => role.vouching.enabled && !role.open)).toBe(true);
    }
    const rich = getRichTemplateById(id);
    expect(rich.defaults.roles.map(role => [role.name, role.open, role.maxMembers, role.vouching.quorum]))
      .toEqual(defaults.roles.map(role => [role.name, role.open, role.maxMembers, role.vouching.quorum]));
    for (const variation of Object.values(rich.variations || {})) {
      const next = deployerReducer(state, { type: ACTION_TYPES.APPLY_VARIATION, payload: { variation, template: rich } });
      expect(validateDeploymentConfig(next).errors, `${id} variation`).toEqual([]);
      expect(() => createDeploymentConfig(next, founder, { registryAddress: registry })).not.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
