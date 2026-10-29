import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { readOrganizationTotals, organizationTotalsKey } from '@/util/organizationTotals';

const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const authority = address(1), token = address(2), hub = address(3);
const ORG = `0x${'ee'.repeat(32)}`, HASH = `0x${'ab'.repeat(32)}`;
const source = { chainId: 100, endpoint: 'https://totals.invalid', orgId: ORG, method: 'graph', indexed: true, snapshot: 'latest' };
const subject = { id: composeSubjectId(authority, 1), subjectId: composeSubjectId(authority, 1), kind: 'Role', defaultAllow: true,
  vouchConfig: null, organization: { id: ORG }, authority: { id: authority } };
const membership = n => ({ id: `${subject.id}-${address(n)}`, user: address(n), accepted: true, emailVerified: false,
  ruleKind: 'None', vouchCount: 0, vouchEpoch: '0', subject, organization: { id: ORG }, authority: { id: authority } });
const balance = (n, raw) => ({ id: `${token}-${address(n)}`, account: address(n), balance: raw, updatedAtBlock: '99',
  participationToken: { id: token, organization: { id: ORG } } });
const completion = (n, learner) => ({ id: `${hub}-${n}-${learner}`, learner, moduleId: String(n), completedAt: '999', completedAtBlock: '99',
  transactionHash: HASH, module: { id: `${hub}-${n}` }, educationHub: { id: hub, organization: { id: ORG } } });
function fixture({ members = [], holders = [], lessons = [], alter } = {}) {
  const query = vi.fn(async (document, variables, ref) => {
    expect(ref.chainId).toBe(100); expect(ref.endpoint).toBe(source.endpoint);
    if (variables.block) expect(variables.block).toEqual({ hash: HASH });
    const state = /State\(/.test(document);
    let data = { _meta: { deployment: 'fixture', hasIndexingErrors: false, block: { number: 100, hash: HASH, timestamp: 1000 } } };
    if (state && document.includes('CurrentMemberTotalState')) data.organization = { id: ORG, executorContract: null, eligibilityModule: null,
      membershipAuthority: { id: authority, isRouterBound: true, cutoverAt: '1', acceptedMembershipCount: members.filter(row => row.accepted).length } };
    else if (state && document.includes('TokenHolderTotalState')) data.participationTokenContract = { id: token, totalSupply: holders.reduce((sum, row) => sum + BigInt(row.balance), 0n).toString(), organization: { id: ORG } };
    else if (state) data.educationHubContract = { id: hub, organization: { id: ORG } };
    else {
      const [field, rows] = document.includes('CurrentMemberTotalPage') ? ['subjectMemberships', members]
        : document.includes('TokenHolderTotalPage') ? ['tokenBalances', holders] : ['moduleCompletions', lessons];
      data[field] = rows.filter(row => row.id > variables.cursor).sort((a, b) => a.id.localeCompare(b.id)).slice(0, variables.first);
    }
    return alter ? alter(data, variables, document) : data;
  });
  return { source, authority, token, hub, query, pageSize: 2, maxPages: 10 };
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('actual installed core totals consumed by the shared frontend reader', () => {
  it('pins all domains once, exhausts pages, deduplicates readers and preserves distinct learner and reward semantics', async () => {
    const options = fixture({ members: [membership(10), membership(11), membership(12)],
      holders: [balance(10, '9007199254740993000000000000000001'), balance(11, '1'), balance(12, '0')],
      lessons: [completion(1, address(10)), completion(2, address(10)), completion(3, address(11))] });
    const [first, second] = await Promise.all([readOrganizationTotals(options), readOrganizationTotals(options)]);
    expect(first).toBe(second); expect(first.totals).toEqual({ members: 3, holders: 2, completions: 3, learners: 2 });
    expect(first.snapshots.education.data.rewardTotalRaw).toMatchObject({ state: 'unknown', code: 'COMPLETION_PAYOUT_NOT_INDEXED' });
    expect(first.snapshots.holders.data.balanceTotalRaw.value).toBe('9007199254740993000000000000000002');
    expect(options.query.mock.calls.filter(([, variables]) => !variables.block)).toHaveLength(1);
    expect(options.query.mock.calls.filter(([doc]) => doc.includes('Page('))).toHaveLength(6);
    const calls = options.query.mock.calls.length;
    expect(await readOrganizationTotals(options)).toBe(first); expect(options.query).toHaveBeenCalledTimes(calls);
    await readOrganizationTotals({ ...options, force: true }); expect(options.query.mock.calls.length).toBeGreaterThan(calls);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('renders an enumerated zero distinctly from a missing collection', async () => {
    expect((await readOrganizationTotals(fixture())).totals).toEqual({ members: 0, holders: 0, completions: 0, learners: 0 });
    const unknown = await readOrganizationTotals(fixture({ alter(data) { delete data.tokenBalances; delete data.moduleCompletions; return data; } }));
    expect(unknown.totals).toEqual({ members: 0, holders: null, completions: null, learners: null });
  });
  it.each(['cap', 'org', 'authority', 'token', 'hub', 'hash', 'health', 'supply'])('never promotes observed diagnostics after %s failure', async mode => {
    const options = fixture({ members: [membership(10), membership(11)], holders: [balance(10, '1')], lessons: [completion(1, address(10))],
      alter(data, variables, doc) {
        if (!variables.block) return data;
        if (mode === 'org' && data.participationTokenContract) data.participationTokenContract.organization.id = `0x${'dd'.repeat(32)}`;
        if (mode === 'authority' && data.organization) data.organization.membershipAuthority.id = token;
        if (mode === 'token' && data.tokenBalances) data.tokenBalances.forEach(row => { row.participationToken.id = hub; });
        if (mode === 'hub' && data.educationHubContract) data.educationHubContract.id = token;
        if (mode === 'hash') data._meta.block.hash = `0x${'cd'.repeat(32)}`;
        if (mode === 'health') data._meta.hasIndexingErrors = true;
        if (mode === 'supply' && data.participationTokenContract) data.participationTokenContract.totalSupply = '2';
        return data;
      } });
    if (mode === 'cap') options.maxPages = 1;
    const result = await readOrganizationTotals(options);
    const field = ['org', 'token', 'supply'].includes(mode) ? 'holders' : mode === 'hub' ? 'completions' : 'members';
    expect(result.totals[field]).toBeNull();
  });
  it('does not accept an account hint or zero/missing authority as organization evidence', async () => {
    await expect(readOrganizationTotals({ ...fixture(), source: { ...source, account: address(9) } })).rejects.toThrow('binding');
    await expect(readOrganizationTotals({ ...fixture(), authority: address(0) })).rejects.toThrow('binding');
  });
  it('validates before cache hits so account hints and unsupported sources cannot reuse known totals', async () => {
    const options = fixture(); await readOrganizationTotals(options);
    for (const changed of [{ account: address(9) }, { indexed: false }, { snapshot: 'unknown' }]) {
      await expect(readOrganizationTotals({ ...options, source: { ...source, ...changed } })).rejects.toThrow();
    }
  });
  it('uses stable exact scope and block keys', () => {
    const base = fixture();
    for (const changed of [{ source: { ...source, chainId: 42161 } }, { source: { ...source, endpoint: 'https://other.invalid' } },
      { source: { ...source, orgId: HASH } }, { authority: address(4) }, { token: address(5) }, { hub: address(6) },
      { source: { ...source, snapshot: 'pinned', block: { number: '101', hash: HASH } } }]) {
      expect(organizationTotalsKey({ ...base, ...changed })).not.toBe(organizationTotalsKey(base));
    }
  });
});
