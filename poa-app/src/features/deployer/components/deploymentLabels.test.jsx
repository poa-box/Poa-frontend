import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeploymentPreviewModal } from '@/features/deployer/components/DeploymentPreviewModal';
import { BootstrapSection } from '@/features/deployer/components/bootstrap/BootstrapSection';
import IdentityStep from '@/features/deployer/steps/IdentityStep';
import { initialState } from '@/features/deployer/context/deployerReducer';
import { getTemplateDefaults, TEMPLATE_IDS } from '@/features/deployer/templates/templateDefinitions';
import { createDeploymentConfig } from '@/features/deployer/utils/deploymentMapper';
import { TaskManagerPermsMatrix } from '@/features/deployer/components/permissions/TaskManagerPermsMatrix';
import { buildOrgMetadata } from '@/features/deployer/utils/orgMetadata';

const fixture = vi.hoisted(() => ({ state: null, inputs: [], checkboxes: [], update: null }));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const chakra = (await import('@/test/mockChakra')).mockChakra();
  chakra.useColorModeValue = light => light;
  chakra.useBreakpointValue = () => false;
  chakra.Input = props => { fixture.inputs.push(props); return createElement('input', { value: props.value, readOnly: true }); };
  chakra.Checkbox = props => { fixture.checkboxes.push(props); return createElement('div', null, props.children); };
  return chakra;
});
vi.mock('@chakra-ui/icons', () => ({ InfoIcon: () => null, CloseIcon: () => null, AddIcon: () => null }));
vi.mock('@/features/deployer/context/DeployerContext', () => ({
  UI_MODES: { ADVANCED: 'advanced' }, useDeployer: () => ({ state: fixture.state, actions: { updateOrganization: (...args) => fixture.update(...args) } }),
}));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ addToIpfs: vi.fn(() => { throw new Error('Unexpected upload'); }) }) }));
vi.mock('@/features/deployer/components/common/AddressListInput', () => ({ AddressListInput: () => null }));
vi.mock('@/features/deployer/components/common', () => ({ StepHeader: () => null, NavigationButtons: () => null, ValidationSummary: () => null }));
vi.mock('react-dropzone', () => ({ useDropzone: () => ({ getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false }) }));

beforeEach(() => {
  fixture.inputs = []; fixture.checkboxes = []; fixture.update = vi.fn();
  fixture.state = {
    organization: { name: 'Together', description: 'Together', links: [], tokenName: '', tokenSymbol: '' },
    ui: { mode: 'advanced' }, features: {}, roles: [],
    bootstrap: { projects: [{ title: 'First', cap: '', managers: [] }], tasks: [{ title: 'Work', payout: '1', projectIndex: 0 }] },
  };
});

describe('launch forms and preview honor the same Shares preference', () => {
  it.each([
    [undefined, 'MiXeD', 'Shares'], [false, 'MiXeD', 'Shares'], [true, 'MiXeD', 'MiXeD'],
    [true, '', 'Shares'], [true, '  ', 'Shares'], [true, undefined, 'Shares'],
  ])('keeps preference %s and symbol %s consistent', (flag, symbol, expected) => {
    fixture.state.organization.useTokenSymbol = flag;
    fixture.state.organization.tokenSymbol = symbol;
    const metadata = buildOrgMetadata(fixture.state);
    const preview = renderToStaticMarkup(<DeploymentPreviewModal data={{ orgName: 'Together', metadata,
      params: { tokenSymbol: symbol, roles: [], hybridClasses: [{ strategy: 1, slicePct: 100 }] }, predicted: {} }} />);
    expect(preview).toContain(`Voting power follows ${expected}`);
    const form = renderToStaticMarkup(<BootstrapSection />);
    expect(form).toContain(`${expected} cap (optional)`);
    expect(form).toContain(`Reward (${expected})`);
  });

  it('preserves typed symbol case and persists an explicit opt-in action', () => {
    renderToStaticMarkup(<IdentityStep />);
    const symbol = fixture.inputs.find(input => input.placeholder === 'SHARES');
    expect(symbol).toBeDefined();
    symbol.onChange({ target: { value: 'MiXeD' } });
    expect(fixture.update).toHaveBeenCalledWith({ tokenSymbol: 'MiXeD' });
    const preference = fixture.checkboxes.find(checkbox => checkbox.children?.props?.children === 'Use the short name for rewards and balances');
    expect(preference).toBeDefined();
    preference.onChange({ target: { checked: true } });
    expect(fixture.update).toHaveBeenCalledWith({ useTokenSymbol: true });
  });
});

describe('prepared preset preview and task permission projection', () => {
  it.each(Object.values(TEMPLATE_IDS))('%s shows the committed membership rules', id => {
    const state = { ...structuredClone(initialState), ...getTemplateDefaults(id) };
    state.organization = { ...initialState.organization, name: 'Together', description: 'Work together with care', username: 'founder' };
    const { params } = createDeploymentConfig(state, '0x1111111111111111111111111111111111111111', {
      registryAddress: '0x2222222222222222222222222222222222222222',
    });
    const html = renderToStaticMarkup(<DeploymentPreviewModal data={{ orgName: 'Together', params,
      metadata: buildOrgMetadata(state), predicted: {} }} />);
    for (const role of state.roles) {
      if (role.vouching.enabled) {
        const count = role.vouching.quorum;
        expect(html).toContain(`${role.name}: ${count} vouch${count === 1 ? '' : 'es'} from members of ${state.roles[role.vouching.voucherRoleIndex].name}`);
      }
    }
    if (id === TEMPLATE_IDS.CUSTOM) expect(html).toContain('granted through governance');
    expect(html).not.toContain('handed out by an');
  });
  it('shows CREATE only for the selected preset task creators', () => {
    fixture.state = { ...fixture.state, ...getTemplateDefaults(TEMPLATE_IDS.OPEN_SOURCE) };
    renderToStaticMarkup(<TaskManagerPermsMatrix />);
    expect(fixture.checkboxes.slice(0, 2).map(control => control.isChecked)).toEqual([false, true]);
    expect(fixture.checkboxes.slice(0, 2).every(control => control.isDisabled)).toBe(true);
  });
});
