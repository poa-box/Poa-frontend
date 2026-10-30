import { describe, expect, it } from 'vitest';
import { utils } from 'ethers';
import AuthorityABI from '../../../abi/MembershipAuthority.json';
import { knownFact } from '@poa-box/core/data/facts';
import { buildV2ElectionBatches } from './v2VoteActions';
import { buildRoleRemovalBatch } from '@/lib/accessV2/proposalBuilders';

const authority = '0x1111111111111111111111111111111111111111';
const alice = '0x2222222222222222222222222222222222222222';
const bob = '0x3333333333333333333333333333333333333333';
const scope = { chainId: 100, orgId: 'org', contract: authority };
const source = { ...scope, endpoint: 'mock://rpc', method: 'observed-fixture', indexed: false,
  snapshot: 'pinned', observedAt: 1000, block: { number: '123' } };
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
const snap = data => ({ source, coverage, data });
const status = (account, accepted) => ({ account, accepted, eligible: accepted, acceptedAt: accepted ? '50' : '0', ruleKind: 0 });
const iface = new utils.Interface(AuthorityABI);
function evidence() {
  return { scope, freshness: { now: 1000, maxAgeSeconds: 30, block: source.block },
    context: snap({ readiness: { membershipAuthority: { id: authority, isRouterBound: true, cutoverAt: '1' } },
      executorAuthorized: knownFact(true), paused: knownFact(false),
      subjects: [{ subjectId: '1', kind: 'Role', maxMembers: '1', memberCount: '1', rulesRevision: 'r1',
        statuses: [status(alice, true), status(bob, false)] },
      { subjectId: '2', kind: 'Role', maxMembers: '0', memberCount: '0', rulesRevision: 'r2',
        statuses: [status(alice, false), status(bob, false)] }],
      accounts: [{ account: alice, acceptedAnywhere: knownFact(true), acceptedSubjectIds: knownFact(['1']) },
        { account: bob, acceptedAnywhere: knownFact(true), acceptedSubjectIds: knownFact(['3']) }],
    }),
    preflights: snap([{ subjectId: '1', account: alice, ban: false, reason: 7, sourceSet: 1 }]),
    confirmedBans: [{ subjectId: '1', account: alice, reason: 7, sourceSet: 1 }],
  };
}
function order() {
  return { authority, subjectId: '1', subjectName: 'Reviewers', candidates: [{ name: 'Bob', address: bob }],
    selectedIncumbents: [{ name: 'Alice', address: alice, ban: true, expectedReason: 7, expectedSourceSet: 1 }],
    planningEvidence: evidence(), includeNoOneOption: true, fallbackSubjectId: '2' };
}

describe('core election/removal planning adapters', () => {
  it('removes before fallback and winner, offers fallback after the only membership is removed, and leaves No One empty', () => {
    const built = buildV2ElectionBatches(order());
    const calls = built.batches[0].map(call => iface.parseTransaction({ data: call.data }));
    expect(calls.map(call => call.name)).toEqual(['remove', 'offer', 'grant']);
    expect(calls[0].args[2]).toBe(true);
    expect(calls[1].args[2]).toBe(true);
    expect(calls[2].args[2]).toBe(false);
    expect(built.optionNames).toEqual(['Bob', 'No One']);
    expect(built.batches[1]).toEqual([]);
  });

  it('blocks missing consent, changed source set, stale evidence and incomplete accepted rosters', () => {
    for (const mutate of [
      input => { input.planningEvidence.confirmedBans = []; },
      input => { input.planningEvidence.preflights.data[0].sourceSet = 2; },
      input => { input.planningEvidence.freshness.now = 1031; },
      input => { input.planningEvidence.context.data.subjects[0].memberCount = '2'; },
    ]) {
      const input = order(); mutate(input);
      expect(() => buildV2ElectionBatches(input)).toThrow('could not be verified');
    }
  });

  it('uses exact reviewed ban consent for removal and never quietly upgrades a soft choice', () => {
    const config = { authority, subjectId: '1', subjectName: 'Reviewers', confirmBans: true, liveReconciled: true,
      members: [{ address: alice, ban: true, expectedReason: 7, expectedSourceSet: 1 }], planningEvidence: evidence() };
    const built = buildRoleRemovalBatch(config);
    expect(iface.parseTransaction({ data: built.batch[0].data }).args[2]).toBe(true);
    expect(built.summaries[0]).toBe('Remove 1 role membership in one atomic batch.');
    expect(() => buildRoleRemovalBatch({ ...config, members: [{ ...config.members[0], ban: false }] })).toThrow('could not be verified');
  });
});
