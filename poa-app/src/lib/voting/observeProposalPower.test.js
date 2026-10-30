import { describe, expect, it, vi } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { observeProposalPower } from '@/lib/voting/observeProposalPower';
import { proposalEligibilityFact, proposalRawPowerPreview } from '@/lib/voting/powerAdapter';

const addr = digit => `0x${digit.repeat(40)}`;
const authorityAddress = addr('1'), votingAddress = addr('2'), account = addr('3'), executor = addr('4'), asset = addr('5');
const orgId = `0x${'6'.repeat(64)}`, hash = `0x${'7'.repeat(64)}`;
const role = composeSubjectId(authorityAddress, '1');
const scope = { chainId: 100, orgId, account, contract: votingAddress,
  contracts: { membershipAuthority: authorityAddress, executor } };
const source = { chainId: 100, orgId, contract: authorityAddress, endpoint: 'https://index.example',
  method: 'authority', indexed: true, snapshot: 'pinned', block: { number: '123', hash } };
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
function fixture() {
  const voting = {
    getProposalClasses: vi.fn(async () => [{ strategy: 1, slicePct: 100, quadratic: false, minBalance: '1', asset, hatIds: [] }]),
    proposalCreatedAt: vi.fn(async () => '10'), membershipAuthority: vi.fn(async () => authorityAddress),
    executor: vi.fn(async () => executor), pollRestricted: vi.fn(async () => false),
    proposalClassSubject: vi.fn(async () => role),
  };
  const token = { balanceOf: vi.fn(async () => '1') };
  const provider = { getNetwork: vi.fn(async () => ({ chainId: 100 })),
    getBlock: vi.fn(async () => ({ number: 123, hash })) };
  const readFactory = { provider, createReadOnly: vi.fn(address => address === asset ? token : voting) };
  const authority = { source, coverage, data: { subjects: [{ subjectId: role, kind: 'Role' }],
    memberships: [{ id: 'm', user: account, accepted: true, acceptedAt: '1', seededWhilePaused: false,
      emailVerified: false, ruleKind: 'None', rule: null, pendingAction: null, vouchCount: '0', vouchEpoch: '0',
      subject: { subjectId: role, kind: 'Role', defaultAllow: true, vouchConfig: null } }], permissions: [], groupEdges: [] } };
  const query = vi.fn(async () => ({ _meta: { block: { number: 123, hash } },
    organization: { id: orgId, hybridVoting: { id: votingAddress } }, ddvproposals: [],
    proposals: [{ id: `${votingAddress}-9`, proposalId: '9', createdAtBlock: '100', startTimestamp: '10',
      hybridVoting: { id: votingAddress, organization: { id: orgId } }, isHatRestricted: false, restrictedHatIds: [] }] }));
  return { input: { readFactory, query, scope, authority, proposalId: '9', rpcEndpoint: 'https://rpc.example' }, voting, provider, token };
}

describe('mounted proposal immutable power observer', () => {
  it('reads frozen subjects and 1 wei for the restored account at one actual block', async () => {
    const { input, voting, token } = fixture();
    const evidence = await observeProposalPower(input);
    expect(evidence.proposal.data.classes[0].subjectId.value).toBe(role);
    expect(evidence.balances[asset].value).toBe('1');
    expect(evidence.balances[asset].source).toMatchObject({ chainId: 100, account, contract: asset, block: source.block });
    expect(token.balanceOf).toHaveBeenCalledWith(account, { blockTag: 123 });
    expect(voting.proposalClassSubject).toHaveBeenCalledWith('9', 0, { blockTag: 123 });
    expect(proposalEligibilityFact(evidence)).toMatchObject({ state: 'known', value: true });
    expect(proposalEligibilityFact({ ...evidence, scope: { ...scope, account: addr('8') } }).state).toBe('unknown');
  });
  it('keeps optimistic class powers exact above Number precision, and withholds foreign-account powers', async () => {
    const { input, token } = fixture();
    const raw = '900719925474099312345';
    token.balanceOf.mockResolvedValue(raw);
    const evidence = await observeProposalPower(input);
    expect(proposalRawPowerPreview(evidence)).toEqual([(BigInt(raw) * 100n).toString()]);
    expect(proposalRawPowerPreview({ ...evidence, scope: { ...scope, account: addr('8') } })).toBeUndefined();
  });
  it.each(['chain', 'fork', 'module', 'partial'])('rejects %s evidence without guessing a class binding', async kind => {
    const { input, voting, provider } = fixture();
    if (kind === 'chain') provider.getNetwork.mockResolvedValue({ chainId: 42161 });
    if (kind === 'fork') provider.getBlock.mockResolvedValue({ number: 123, hash: `0x${'8'.repeat(64)}` });
    if (kind === 'module') voting.membershipAuthority.mockResolvedValue(addr('9'));
    if (kind === 'partial') input.authority = { ...input.authority, coverage: { ...coverage, status: 'incomplete' } };
    await expect(observeProposalPower(input)).rejects.toThrow();
  });
});
