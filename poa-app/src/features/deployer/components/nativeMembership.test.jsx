import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NativeMembershipFields, { changeMembershipMethod, membershipSummary } from '@/features/deployer/components/role/NativeMembershipFields';
import LegacyDraftNotice from '@/features/deployer/components/LegacyDraftNotice';
import { initialState } from '@/features/deployer/context/deployerReducer';
import { validateAccessV2Representability } from '@/features/deployer/utils/deploymentMapperV2';
import { mapCoreDeploymentParams } from '@/lib/deployment/coreDeployment';
import { nativeMembershipWarnings } from '@/lib/deployment/nativeDraft';
const controls = vi.hoisted(() => ({ selects: [], buttons: [] }));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const chakra = (await import('@/test/mockChakra')).mockChakra();
  chakra.Select = props => { controls.selects.push(props); return createElement('select', { value: props.value, readOnly: true }, props.children); };
  chakra.Button = props => { controls.buttons.push(props); return createElement('button', null, props.children); };
  return chakra;
});
beforeEach(() => { controls.selects = []; controls.buttons = []; });
const stateWith = () => {
  const state = structuredClone(initialState);
  state.organization = { ...state.organization, name: 'Together', description: 'Working with care', username: 'founder' };
  return state;
};
describe('native membership controls and saved-draft guard', () => {
  it.each(['open', 'vouching', 'governance'])('assembles the native %s choice without retired settings', method => {
    const state = stateWith();
    renderToStaticMarkup(<NativeMembershipFields role={state.roles[1]} roles={state.roles}
      onChange={role => { state.roles[1] = role; }} />);
    controls.selects[0].onChange({ target: { value: method } });
    const params = mapCoreDeploymentParams(state, '0x1111111111111111111111111111111111111111', {
      registryAddress: '0x2222222222222222222222222222222222222222',
    });
    expect(params.roles[1].open).toBe(method === 'open');
    expect(params.roles[1].vouching.enabled).toBe(method === 'vouching');
  });
  it('explains a founding-team vouch shortfall while preserving the chosen quorum', () => {
    const state = stateWith(); state.roles[0].open = false;
    state.roles[0].vouching = { enabled: true, quorum: 2, voucherRoleIndex: 0 };
    expect(nativeMembershipWarnings(state.roles)).toEqual([expect.stringMatching(/2 vouches.*1 member/)]);
    expect(state.roles[0].vouching.quorum).toBe(2);
    state.roles[0].distribution.additionalMembers = [{ address: '0x2222222222222222222222222222222222222222' }];
    expect(nativeMembershipWarnings(state.roles)).toEqual([]);
  });
  it('offers open, vouch and governance membership without parent, standing or immutable controls', () => {
    const state = stateWith(), onChange = vi.fn();
    const markup = renderToStaticMarkup(<NativeMembershipFields role={state.roles[1]} roles={state.roles} onChange={onChange} />);
    expect(markup).toContain('Granted through governance');
    expect(markup).toContain('Anyone can claim');
    expect(markup).toContain('Needs member vouches');
    expect(markup).not.toMatch(/parent|standing|immutable|manager/i);
    controls.selects[0].onChange({ target: { value: 'vouching' } });
    expect(onChange.mock.calls[0][0]).toMatchObject({ open: false, vouching: { enabled: true, quorum: 1 } });
    const vouched = changeMembershipMethod(state.roles[0], 'vouching');
    vouched.vouching.quorum = 3; vouched.vouching.voucherRoleIndex = 1;
    expect(membershipSummary(vouched, state.roles)).toBe('3 vouches from members of Executive');
    expect(changeMembershipMethod(vouched, 'governance')).toMatchObject({ open: false, vouching: { enabled: false, quorum: 3 } });
  });
  it.each([
    ['old parent placeholder', state => { state.roles[0].hierarchy = { adminRoleIndex: null }; }],
    ['old default eligibility', state => { state.roles[0].defaults = { eligible: true, standing: true }; }],
    ['old mutable-role placeholder', state => { state.roles[0].hatConfig = { maxSupply: 100, mutableHat: true }; }],
    ['parent', state => { state.roles[0].hierarchy = { adminRoleIndex: 1 }; }],
    ['parent vouches', state => { state.roles[0].vouching.combineWithHierarchy = true; }],
    ['standing', state => { state.roles[0].defaults = { eligible: true, standing: false }; }],
    ['immutable', state => { state.roles[0].hatConfig = { maxSupply: 100, mutableHat: false }; }],
    ['poll execution', state => { state.ddInitialTargets = ['0x1111111111111111111111111111111111111111']; }],
  ])('rejects imported %s semantics and offers an actionable reset without changing the draft', (_name, mutate) => {
    const state = stateWith(); mutate(state); const saved = structuredClone(state); const reset = vi.fn();
    expect(validateAccessV2Representability(state).isValid).toBe(false);
    const html = renderToStaticMarkup(<LegacyDraftNotice state={state} onReset={reset} />);
    expect(html).toContain('This saved draft uses retired settings');
    expect(html).toContain('Choose a current template or reset the draft');
    expect(state).toEqual(saved);
    controls.buttons[0].onClick(); expect(reset).toHaveBeenCalledOnce();
  });
});
