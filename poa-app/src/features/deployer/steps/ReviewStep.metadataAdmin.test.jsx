import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { initialState } from '@/features/deployer/context/deployerReducer';
import { getTemplateDefaults, TEMPLATE_IDS } from '@/features/deployer/templates/templateDefinitions';
import { createDeploymentConfig } from '@/features/deployer/utils/deploymentMapper';
import { buildOrgMetadata } from '@/features/deployer/utils/orgMetadata';

const fixture = vi.hoisted(() => ({ state: null, badges: [] }));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const chakra = (await import('@/test/mockChakra')).mockChakra();
  chakra.useColorModeValue = light => light;
  chakra.Badge = props => { fixture.badges.push(props); return createElement('span', null, props.children); };
  return chakra;
});
vi.mock('@chakra-ui/icons', () => ({ EditIcon: () => null, InfoIcon: () => null }));
vi.mock('@/features/deployer/context/DeployerContext', async () => {
  const { PERMISSION_KEYS, PERMISSION_DESCRIPTIONS, VOTING_STRATEGY, STEPS } = await import('@/features/deployer/context/deployerReducer');
  return { PERMISSION_KEYS, PERMISSION_DESCRIPTIONS, VOTING_STRATEGY, STEPS,
    useDeployer: () => ({ state: fixture.state, actions: {}, selectors: {
      getSelectedChainId: () => fixture.state.selectedChainId, getSelectedTemplate: () => null, isAdvancedMode: () => false,
    } }),
  };
});
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: '0x1111111111111111111111111111111111111111' }) }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));
vi.mock('@/components/passkey/PasskeyOnboardingModal', () => ({ default: () => null }));
vi.mock('@/features/deployer/components/common/NavigationButtons', () => ({ default: () => null }));
vi.mock('@/features/deployer/components/review/DeployerUsernameSection', () => ({ DeployerUsernameSection: () => null }));

import ReviewStep from '@/features/deployer/steps/ReviewStep';
import { DeploymentPreviewModal } from '@/features/deployer/components/DeploymentPreviewModal';

const FOUNDER = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
function draft(template) {
  const state = { ...structuredClone(initialState), ...(template ? getTemplateDefaults(template) : {}) };
  state.organization = { ...initialState.organization, name: 'Together', description: 'Work together with care', username: 'founder' };
  return state;
}
function prepared() {
  return createDeploymentConfig(fixture.state, FOUNDER, { registryAddress: REGISTRY }).params;
}
function reviewBadge(label) {
  fixture.badges.length = 0;
  const html = renderToStaticMarkup(<ReviewStep isWalletConnected />);
  expect(html.replace(/<[^>]*>/g, '')).toContain(`Metadata Admin:${label}`);
  const badge = fixture.badges.find(item => item.children === label && item.px === 3 && item.borderRadius === 'full');
  expect(badge).toBeDefined();
  return { html, badge };
}
function preview(params) {
  return renderToStaticMarkup(<DeploymentPreviewModal data={{ orgName: 'Together', params,
    metadata: buildOrgMetadata(fixture.state), predicted: {} }} />);
}
function previewAdmin(params, label) {
  expect(preview(params).replace(/<[^>]*>/g, '')).toContain(`Org profile edits${label}`);
}
beforeEach(() => {
  fixture.state = draft(); fixture.badges.length = 0;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());

describe('actual launch review metadata administrator agrees with native prepared payload', () => {
  it.each([undefined, TEMPLATE_IDS.WORKER_COOP])('shows founding administrators for the %s default without changing preparation', template => {
    fixture.state = draft(template);
    const original = structuredClone(fixture.state);
    const params = prepared();
    expect(params.metadataAdminRoleIndex.eq(ethers.constants.MaxUint256)).toBe(true);
    const { html, badge } = reviewBadge('Founding administrators');
    expect(html).not.toContain('Governance Only');
    expect(badge).toMatchObject({ bg: 'amethyst.100', color: 'amethyst.700' });
    previewAdmin(params, 'Founding administrators');
    expect(fixture.state).toEqual(original);
    expect(prepared()).toEqual(params);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([0, 1])('shows explicit role %s in the badge and the exact payload preview', roleIndex => {
    fixture.state.metadataAdminRoleIndex = roleIndex;
    const params = prepared();
    expect(params.metadataAdminRoleIndex.toString()).toBe(String(roleIndex));
    const { badge } = reviewBadge(fixture.state.roles[roleIndex].name);
    expect(badge).toMatchObject({ bg: 'amethyst.100', color: 'amethyst.700' });
    previewAdmin(params, fixture.state.roles[roleIndex].name);
  });

  it.each([undefined, ethers.constants.MaxUint256.toString(), ethers.constants.MaxUint256])('honors the native default/sentinel %s rather than calling it governance-only', value => {
    fixture.state.metadataAdminRoleIndex = value;
    const params = prepared();
    expect(params.metadataAdminRoleIndex.eq(ethers.constants.MaxUint256)).toBe(true);
    reviewBadge('Founding administrators');
    previewAdmin(params, 'Founding administrators');
  });

  it.each([-1, 99, 'governance'])('keeps unsupported metadata admin choice %s invalid without inventing a governance-only policy', value => {
    fixture.state.metadataAdminRoleIndex = value;
    expect(() => prepared()).toThrow(/metadataAdminRoleIndex/);
    const { html, badge } = reviewBadge('Not configured');
    expect(html).not.toContain('Governance Only');
    expect(badge).toMatchObject({ bg: 'warmGray.100', color: 'warmGray.600' });
  });

  it('retains neutral member reward copy and the label preference in the exact payload preview', () => {
    fixture.state.organization.useTokenSymbol = true;
    fixture.state.organization.tokenSymbol = 'MiXeD';
    fixture.state.voting.classes = [{ strategy: 1, slicePct: 100, quadratic: false, minBalance: '0', hatIds: [] }];
    const { html } = reviewBadge('Founding administrators');
    expect(html).toContain('receive rewards');
    expect(html).not.toContain('request tokens');
    expect(preview(prepared())).toContain('Voting power follows MiXeD');
    fixture.state.organization.useTokenSymbol = false;
    expect(preview(prepared())).toContain('Voting power follows Shares');
    fixture.state.organization.useTokenSymbol = true;
    fixture.state.organization.tokenSymbol = '';
    expect(preview(prepared())).toContain('Voting power follows Shares');
  });
});
