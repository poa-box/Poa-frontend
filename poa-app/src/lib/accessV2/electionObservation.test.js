import { describe, expect, it, vi } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { electionPlanningFingerprint, planRoleRemovals } from '@poa-box/core/governance/elections';
import { observeElection } from '@/lib/accessV2/electionObservation';
import { recheckGovernanceSubmission } from '@/lib/voting/governanceSubmission';

const address = digit => `0x${digit.repeat(40)}`;
const authority = address('1'), executor = address('2'), alice = address('3');
const orgId = `0x${'4'.repeat(64)}`, hash = `0x${'5'.repeat(64)}`, subjectId = composeSubjectId(authority, '1');
const scope = { chainId: 100, orgId, contract: authority };
const source = { ...scope, endpoint: 'https://index.example', method: 'authority', indexed: true, snapshot: 'pinned', block: { number: '123', hash } };
const coverage = { status: 'complete', receivedKeys: [], failedIds: [], missingIds: [], issues: [] };
function fixture() {
  const live = { executor: vi.fn(async () => executor), orgId: vi.fn(async () => orgId), paused: vi.fn(async () => false),
    getSubject: vi.fn(async () => ({ exists: true, maxMembers: '1' })), memberCount: vi.fn(async () => '1'),
    getStatus: vi.fn(async () => ({ accepted: true, eligible_: true, acceptedAt: '10', ruleKind: 0 })),
    userSubjects: vi.fn(async () => [subjectId]), canRemove: vi.fn(async () => ({ reason: 7, sourceSet: 1 })) };
  const provider = { connection: { url: 'https://rpc.example' }, getNetwork: vi.fn(async () => ({ chainId: 100 })),
    getBlock: vi.fn(async () => ({ number: 123, hash, timestamp: 1000 })) };
  const snapshot = { source, coverage, data: { authority: { isRouterBound: true, cutoverAt: '1' },
    subjects: [{ subjectId, kind: 'Role', raw: { id: subjectId, lastUpdatedAt: '100' } }],
    memberships: [{ subject: { subjectId }, user: alice, accepted: true }], collections: { accessRules: { data: [] } } } };
  return { input: { readFactory: { provider, createReadOnly: () => live }, snapshot, scope, executor, subjectId, now: () => 1001 }, live };
}
const choice = { account: alice, ban: true, expectedReason: 7, expectedSourceSet: 1 };
const consent = { subjectId, account: alice, reason: 7, sourceSet: 1 };

describe('wizard role-removal observation', () => {
  it('always tests a non-banning removal and requires the exact reviewed durable consent', async () => {
    const { input, live } = fixture();
    const evidence = await observeElection(input);
    expect(live.canRemove).toHaveBeenCalledWith(subjectId, alice, false, { blockTag: 123 });
    const plan = args => planRoleRemovals({ ...evidence, subjectId, removals: [choice], ...args });
    expect(plan({ confirmedBans: [] }).status).toBe('blocked');
    expect(plan({ confirmedBans: [consent] }).status).toBe('ready');
    expect(evidence.context.data.accounts[0].acceptedSubjectIds.value).toEqual([subjectId]);
  });
  it('does not infer renewed ban consent from a refreshed source set or changed roster', async () => {
    const { input, live } = fixture();
    const reviewed = await observeElection(input);
    const expectedFingerprint = electionPlanningFingerprint(reviewed.context.data, reviewed.preflights.data);
    live.canRemove.mockResolvedValue({ reason: 7, sourceSet: 5 });
    const fresh = await observeElection(input);
    const result = planRoleRemovals({ ...fresh, expectedFingerprint, subjectId, removals: [choice], confirmedBans: [consent] });
    expect(result.status).toBe('blocked');
    expect(result.codes).toContain('STALE_ELECTION_PLAN');
  });
  it('retains failed member reads as incomplete preflights rather than a soft-removal decision', async () => {
    const { input, live } = fixture();
    live.canRemove.mockRejectedValue(new Error('mock outage'));
    const evidence = await observeElection(input);
    expect(evidence.preflights.coverage.status).toBe('unavailable');
    expect(planRoleRemovals({ ...evidence, subjectId, removals: [choice], confirmedBans: [consent] }).status).toBe('blocked');
  });
  it('rechecks freshness, explicit consent and the precise calls at the final host submit boundary', async () => {
    const { input } = fixture();
    const evidence = { ...await observeElection(input), confirmedBans: [consent] };
    const plan = planRoleRemovals({ ...evidence, subjectId, removals: [choice] });
    const proposal = { type: 'removeRoleMembers', roleRemovalConfig: { subjectId, confirmBans: true,
      members: [{ address: alice, ban: true, expectedReason: 7, expectedSourceSet: 1 }] },
      batches: plan.data.map(batch => batch.map(call => ({ target: call.target, value: String(call.value), data: call.calldata }))) };
    expect(() => recheckGovernanceSubmission(proposal, evidence, 1001)).not.toThrow();
    expect(() => recheckGovernanceSubmission(proposal, evidence, 1040)).toThrow('Review');
    expect(() => recheckGovernanceSubmission({ ...proposal, roleRemovalConfig: { ...proposal.roleRemovalConfig, confirmBans: false } }, evidence, 1001)).toThrow('Confirm');
    expect(() => recheckGovernanceSubmission({ ...proposal, batches: [[], []] }, evidence, 1001)).toThrow('differ');
  });
});
