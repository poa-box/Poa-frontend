import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { readOrganizationTotals } from '@/util/organizationTotals';
import { createParityHost } from '@/test/parityHost';
const f = vi.hoisted(() => ({ directory: {} }));
vi.mock('@/context/profileHubContext', () => ({ useProfileHubContext: () => f.directory }));
vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
import ProofBand from '@/components/marketing/landing/ProofBand';
const ORG = `0x${'ee'.repeat(32)}`, HASH = `0x${'ab'.repeat(32)}`, AUTH = `0x${'12'.repeat(20)}`;
let host;
async function members(endpoint, users) {
  const subject = { id: composeSubjectId(AUTH, 1), subjectId: composeSubjectId(AUTH, 1), kind: 'Role', defaultAllow: true,
    vouchConfig: null, organization: { id: ORG }, authority: { id: AUTH } };
  const query = vi.fn(async document => ({ _meta: { deployment: 'fixture', hasIndexingErrors: false, block: { number: 100, hash: HASH, timestamp: 1000 } },
    ...(document.includes('CurrentMemberTotalState') ? { organization: { id: ORG, executorContract: null, eligibilityModule: null,
      membershipAuthority: { id: AUTH, isRouterBound: true, cutoverAt: '1', acceptedMembershipCount: users } } }
      : { subjectMemberships: Array.from({ length: users }, (_, n) => ({ id: `${subject.id}-0x${(n + 1).toString(16).padStart(40, '0')}`, user: `0x${(n + 1).toString(16).padStart(40, '0')}`,
        accepted: true, emailVerified: false, ruleKind: 'None', vouchCount: 0, vouchEpoch: '0', subject, organization: { id: ORG }, authority: { id: AUTH } })) }) }));
  const result = await readOrganizationTotals({ source: { chainId: 100, endpoint, orgId: ORG, indexed: true, snapshot: 'latest', method: 'graphql' },
    authority: AUTH, kinds: ['members'], query, force: true });
  expect(query).toHaveBeenCalled(); return result.totals.members;
}
beforeEach(() => { f.directory = { isLoading: true, isComplete: false, perpetualOrganizations: [] };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); host = createParityHost(); });
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('mounted landing membership aggregate', () => {
  it('mounts actual proof counts from separate real core totals and preserves unknown coverage', async () => {
    await host.render(<ProofBand />); expect(host.container.textContent).not.toContain('memberships');
    const first = await members('https://first.invalid/graphql', 2), second = await members('https://second.invalid/graphql', 3);
    expect([first, second]).toEqual([2, 3]);
    f.directory = { isLoading: false, isComplete: true, perpetualOrganizations: [{ id: 'Community', totalMembers: first }, { id: 'Another', totalMembers: second }] };
    await host.render(<ProofBand />);
    expect(host.container.textContent).toContain('2 organizations and 5 memberships');
    f.directory = { ...f.directory, isComplete: false }; await host.render(<ProofBand />);
    expect(host.container.textContent).toContain('2 organizations'); expect(host.container.textContent).not.toContain('5 memberships');
    f.directory = { ...f.directory, isComplete: true, perpetualOrganizations: [{ id: 'Community', totalMembers: null }] };
    await host.render(<ProofBand />); expect(host.container.textContent).not.toContain('memberships');
    expect(host.container.textContent).toContain('1 organization');
  });
});
