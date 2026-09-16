import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DashboardPage from '@/features/application/pages/DashboardPage';
import TeamPage from '@/features/application/pages/TeamPage';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';
import { resolveTokenLabel } from '@/util/tokenLabel';

const state = vi.hoisted(() => ({ authority: null, matrix: null, card: null, members: null, vouchPanels: 0, label: undefined, loading: false, shareArgs: null }));
vi.mock('@chakra-ui/react', async () => {
  const chakra = (await import('@/test/mockChakra')).mockChakra();
  chakra.useBreakpointValue = () => ({});
  chakra.useClipboard = () => ({ hasCopied: false, onCopy() {} });
  return chakra;
});
vi.mock('next/link', () => ({ default: ({ children }) => children }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, push() {} }) }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/components/shared/CommunityLoadingState', () => ({ default: ({ label }) => label }));
vi.mock('@/components/shared/PostDeployLoadingScreen', () => ({ default: () => null }));
vi.mock('@/components/userPage/OngoingPolls', () => ({ default: () => null }));
vi.mock('@/components/common/UserIdentity', () => ({ default: () => null }));
vi.mock('@/components/dashboard/OrgStructureCard', () => ({ OrgStructureCard: props => { state.card = props; return null; } }));
vi.mock('@/components/accessV2/RolesGroupsPanel', () => ({ default: () => { state.vouchPanels += 1; return 'Current role vouches'; } }));
vi.mock('@/components/accessV2', () => ({ AccessV2TeamSection: () => 'Current role controls' }));
vi.mock('@/components/accessV2/MembersSpotlight', () => ({ default: props => { state.members = props; return null; } }));
vi.mock('@/components/orgStructure', () => ({
  OrgOverviewCard: () => null,
  PermissionsMatrix: props => { state.matrix = props; return null; },
  GovernanceConfigSection: () => null,
  DeveloperInfoSection: () => null,
}));
vi.mock('@/context/VotingContext', () => ({ useVotingContext: () => ({ ongoingPolls: [], votingClasses: [] }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ tokenLabel: state.label, poContextLoading: state.loading, ptTokenBalance: '42', educationHubEnabled: true, educationModules: [{ id: 'lesson', name: 'Historic lesson', payout: '3' }] }) }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ recommendedTasks: [] }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ fetchImageFromIpfs() {} }) }));
vi.mock('@/features/tour', () => ({ useTour: () => ({ isActive: false, startTour() {} }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useOrgTheme', () => ({ useOrgTheme: () => ({ pageBackground: () => 'white' }) }));
vi.mock('@/hooks/useShareLink', () => ({ useShareLink: (...args) => { state.shareArgs = args; return '/s/test6-invite'; } }));
vi.mock('@/hooks/useOrgStructure', () => ({ useOrgStructure: () => ({
  orgName: 'Test6', orgMetadata: {}, roles: [{ hatId: 'old', name: 'Retired hat', vouchingEnabled: true }],
  permissionsMatrix: { old: { TaskManager_Create: true } }, permissionColumns: [{ key: 'TaskManager_Create' }],
  membersByRole: { old: [{ address: 'historic-member', totalTasksCompleted: 42 }] },
  totalMembers: 1, loading: state.loading,
}) }));
vi.mock('@/hooks/accessV2', () => ({
  useAuthoritySubjects: () => state.authority,
  useAuthorityMemberships: () => ({ membersOf: () => [{}], groupMembers: new Map() }),
}));

beforeEach(() => {
  const role = {
    subjectId: 'current', hatId: 'current', name: 'Current member', memberCount: 1, groups: [],
    vouchConfig: { enabled: true },
    permGlobal: key => key === PERM_KEYS.TM_PERMS ? { exists: true, value: '3' } : null,
    permEffective: key => key === PERM_KEYS.TM_PERMS ? '3' : '0',
  };
  Object.assign(state, { authority: { enabled: true, loading: false, roles: [role], groups: [] }, matrix: null, card: null, members: null, vouchPanels: 0, label: undefined, loading: false, shareArgs: null });
});

describe('relocated organization pages', () => {
  it('uses current authority roles and vouches while keeping the new invite links', () => {
    const markup = renderToStaticMarkup(<DashboardPage />);
    expect(state.card.roles.map(role => role.name)).toEqual(['Current member']);
    expect(state.vouchPanels).toBe(1);
    expect(markup).toContain('Current role vouches');
    expect(state.shareArgs.slice(0, 2)).toEqual(['/join/', { org: 'Test6' }]);
  });

  it('does not restore historical hats or vouches while authority is unresolved', () => {
    state.authority.enabled = false;
    renderToStaticMarkup(<DashboardPage />);
    expect(state.card.roles).toEqual([]);
    expect(state.vouchPanels).toBe(0);
    renderToStaticMarkup(<TeamPage />);
    expect(state.matrix.roles).toEqual([]);
    expect(state.matrix.permissionsMatrix).toEqual({});
    expect(state.matrix.permissionColumns).toEqual([]);
  });

  it('feeds the current permissions matrix and retains historical member statistics', () => {
    const markup = renderToStaticMarkup(<TeamPage />);
    expect(markup).toContain('Current role controls');
    expect(state.matrix.roles.map(role => role.name)).toEqual(['Current member']);
    expect(state.matrix.permissionsMatrix.current).toEqual({ TaskManager_Create: true, TaskManager_Claim: true });
    expect(state.members.legacyMembersByRole.old[0].totalTasksCompleted).toBe(42);
  });

  it.each([
    [undefined, 'Shares'],
    [resolveTokenLabel({ useTokenSymbol: false, symbol: 'MiXeD' }), 'Shares'],
    [resolveTokenLabel({ useTokenSymbol: true, symbol: 'MiXeD' }), 'MiXeD'],
    [resolveTokenLabel({ useTokenSymbol: true, symbol: '' }), 'Shares'],
  ])('preserves the organization ownership label %s', (label, expected) => {
    state.label = label;
    const markup = renderToStaticMarkup(<DashboardPage />);
    expect(markup).toContain(`Total ${expected}`);
    expect(markup).toContain(`Take a quiz, earn ${expected}.`);
    expect(markup).toContain(`+3 ${expected}`);
  });

  it('retains the new loading presentation on both pages', () => {
    state.loading = true;
    expect(renderToStaticMarkup(<DashboardPage />)).toContain('Loading your community');
    expect(renderToStaticMarkup(<TeamPage />)).toContain('Loading your community');
  });
});
