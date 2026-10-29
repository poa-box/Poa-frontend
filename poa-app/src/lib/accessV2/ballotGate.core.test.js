import { describe, expect, it } from 'vitest';
import { ballotActivation } from './ballotGate';
import { knownFact } from '@poa-box/core/data/facts';
const contract = '0x1111111111111111111111111111111111111111';
const account = '0x2222222222222222222222222222222222222222';
const scope = { chainId: 100, orgId: 'org', account, contract };
const source = { ...scope, endpoint: 'mock://authority', method: 'fixture', indexed: true,
  snapshot: 'pinned', block: { number: '123' } };
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
function evidence() {
  return { scope,
    memberships: { source, coverage, data: [{ subjectId: '1', isMember: knownFact(true), acceptedAt: knownFact('200'), seededWhilePaused: knownFact(false) }] },
    authority: { source: { ...source, account: undefined }, coverage, data: {
      subjects: [{ subjectId: '1', kind: 'Role' }, { subjectId: '2', kind: 'Group' }], permissions: [],
      groupEdges: [{ roleSubjectId: '1', groupSubjectId: '2', isActive: true }],
    } },
  };
}
describe('core activation evidence at the host ballot seam', () => {
  it('resolves group electorates and blocks only known joined-after timing', () => {
    const result = ballotActivation({ enabled: true, proposalCreatedAt: '100', restrictedSubjectIds: ['2'], activationEvidence: evidence() });
    expect(result.blocked).toBe(true);
    expect(result.activeSince).toBe(200);
    expect(result.electorateRows).toBe(1);
    const seeded = evidence(); seeded.memberships.data[0].seededWhilePaused = knownFact(true);
    expect(ballotActivation({ enabled: true, proposalCreatedAt: '100', restrictedSubjectIds: ['2'], activationEvidence: seeded }).blocked).toBe(false);
  });
  it('keeps partial, wrong-scope and malformed restriction evidence indeterminate', () => {
    const inputs = [evidence(), evidence(), evidence()];
    inputs[0].memberships.coverage = { ...coverage, status: 'incomplete' };
    inputs[1].scope = { ...scope, chainId: 42161 };
    for (const activationEvidence of inputs.slice(0, 2)) {
      expect(ballotActivation({ enabled: true, proposalCreatedAt: '100', restrictedSubjectIds: ['2'], activationEvidence }).checked).toBe(false);
    }
    expect(ballotActivation({ enabled: true, proposalCreatedAt: '100', restrictedSubjectIds: ['invalid'], activationEvidence: inputs[2] }).checked).toBe(false);
  });
});
