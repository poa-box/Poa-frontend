import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialState, createDefaultRole, deployerReducer, ACTION_TYPES } from '@/features/deployer/context/deployerReducer';
import { createDeploymentConfig, validateDeploymentConfig } from '@/features/deployer/utils/deploymentMapper';
import { mapStateToAccessV2DeploymentParams } from '@/features/deployer/utils/deploymentMapperV2';
import { changeMembershipMethod } from '@/features/deployer/components/role/NativeMembershipFields';

const DEPLOYER = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const stateWith = () => {
  const state = structuredClone(initialState);
  state.organization = { ...state.organization, name: 'Together', description: 'Shared ownership and care', username: 'founder' };
  return state;
};
const map = state => mapStateToAccessV2DeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); });

describe('native launch regression behavior', () => {
  it('assembles the actual initial wizard with normal identity fields', () => {
    const state = stateWith();
    expect(validateDeploymentConfig(state)).toEqual({ isValid: true, errors: [] });
    const config = createDeploymentConfig(state, DEPLOYER, { registryAddress: REGISTRY });
    expect(config.params.roles.map(role => [role.name, role.open])).toEqual([['Member', true], ['Executive', false]]);
    expect(config.params.roleAssignments.quickJoinRolesBitmap.toString()).toBe('1');
    expect(config.params.ddInitialTargets).toEqual([]);
    expect(config.features).not.toHaveProperty('electionHubEnabled');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([true, false])('deduplicates genesis members, including the founder (assign founder=%s)', assigned => {
    const state = stateWith();
    state.roles[0].distribution = { mintToDeployer: assigned,
      additionalWearers: [DEPLOYER, ALICE, ALICE.toUpperCase().replace('0X', '0x')] };
    expect(map(state).roles[0].distribution.additionalWearers).toEqual(assigned ? [ALICE] : [DEPLOYER, ALICE]);
  });
  it('keeps authored role indices out of undeployed subject-id class filters', () => {
    const state = stateWith(); state.voting.classes[0].hatIds = [0, 1];
    expect(map(state).hybridClasses[0].hatIds).toEqual([]);
  });
  it('rejects an unregistered permission role instead of silently truncating it', () => {
    const state = stateWith(); state.permissions.tokenApproverRoles = [5];
    expect(() => map(state)).toThrow(/references role index 5/);
  });
  it('preserves 16-role assignment bits without signed 32-bit arithmetic', () => {
    const state = stateWith(); state.roles = Array.from({ length: 16 }, (_, index) => createDefaultRole(index, `Role ${index}`));
    state.permissions.ddVotingRoles = [0, 15];
    expect(map(state).roleAssignments.ddVotingRolesBitmap.toString()).toBe('32769');
    state.roles.push(createDefaultRole(16, 'Too many'));
    expect(() => map(state)).toThrow(/at most 16/);
  });
  it('does not weaken the open-role rule for automatic joining', () => {
    const state = stateWith(); state.roles[0] = changeMembershipMethod(state.roles[0], 'vouching');
    expect(() => map(state)).toThrow(/Quick Join.*not open/);
    state.permissions.quickJoinRoles = [];
    expect(map(state).roles[0]).toMatchObject({ open: false, vouching: { enabled: true, quorum: 1 } });
  });
  it('does not reopen membership when vouching is disabled', () => {
    let state = stateWith();
    state = deployerReducer(state, { type: ACTION_TYPES.UPDATE_ROLE_VOUCHING,
      payload: { roleIndex: 0, vouching: { enabled: true, quorum: 2 } } });
    expect(state.roles[0].open).toBe(false);
    state = deployerReducer(state, { type: ACTION_TYPES.UPDATE_ROLE_VOUCHING,
      payload: { roleIndex: 0, vouching: { enabled: false } } });
    expect(state.roles[0].open).toBe(false);
  });
  it('preserves voter minimums through philosophy and variation changes', () => {
    let state = stateWith(); state.voting.hybridVoterQuorum = 5; state.voting.ddVoterQuorum = 4;
    state = deployerReducer(state, { type: ACTION_TYPES.APPLY_PHILOSOPHY,
      payload: { voting: { ...state.voting, hybridVoterQuorum: 0, ddVoterQuorum: 0 }, permissions: state.permissions } });
    state = deployerReducer(state, { type: ACTION_TYPES.APPLY_VARIATION,
      payload: { variation: { settings: { democracyWeight: 70, quorum: 60 } } } });
    expect(state.voting).toMatchObject({ hybridVoterQuorum: 5, ddVoterQuorum: 4 });
  });
  it('keeps voting opt-in and exact UTF-8 identity bounds', () => {
    const state = stateWith(); state.roles.forEach(role => { role.canVote = false; });
    expect(validateDeploymentConfig(state).errors.join(' ')).toMatch(/At least one role/);
    state.roles[0].canVote = true; state.organization.tokenSymbol = '🚀'.repeat(5);
    expect(validateDeploymentConfig(state).isValid).toBe(false);
    state.organization.tokenSymbol = 'MiXeD'; state.organization.tokenName = 'N'.repeat(64);
    expect(validateDeploymentConfig(state).isValid).toBe(true);
  });
});
