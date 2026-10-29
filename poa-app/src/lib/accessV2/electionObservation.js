import { planningReadQueue, assertPlanningReadSize } from '@/lib/accessV2/planningReadQueue';
import { utils } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { knownFact, requireCompleteSnapshot, assertSourceBlock } from '@poa-box/core/data/facts';
import { readRemovalPreflights } from '@poa-box/core/governance/elections';
import { normalizeSubjectId } from '@poa-box/core/authority/ids';

const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
const lower = value => String(value).toLowerCase();

/** Bounded wizard-only observation. Indexed enumeration identifies the roster; actual
 * org-chain status/count/acceptance and non-banning preflights verify it at that same block.
 */
export async function observeElection({ readFactory, snapshot, scope, executor, subjectId, fallbackSubjectId,
  candidates = [], rpcEndpoint, now = () => Math.floor(Date.now() / 1000) }) {
  requireCompleteSnapshot(snapshot, { scope });
  const provider = readFactory.provider || readFactory.signer?.provider;
  if ((await provider.getNetwork()).chainId !== scope.chainId) throw new Error('Role information belongs to another organization.');
  const blockTag = Number(snapshot.source.block.number);
  const block = await provider.getBlock(blockTag);
  const observedAt = now();
  if (!Number.isSafeInteger(blockTag) || !block || !Number.isSafeInteger(block.timestamp)
      || observedAt < block.timestamp || observedAt - block.timestamp > 60) {
    throw new Error('Current role information is still being updated. Please retry.');
  }
  const observedBlock = { number: String(block.number), hash: block.hash };
  assertSourceBlock(observedBlock, snapshot.source.block);
  const source = { ...scope, endpoint: provider.connection?.url || rpcEndpoint, method: 'authority-election-preflight',
    indexed: false, snapshot: 'pinned', block: observedBlock, observedAt };
  const authority = readFactory.createReadOnly(scope.contract, getAbi('MembershipAuthority'));
  const overrides = { blockTag };
  const [actualExecutor, paused, actualOrgId] = await Promise.all([
    authority.executor(overrides), authority.paused(overrides), authority.orgId(overrides),
  ]);
  if (lower(actualOrgId) !== lower(scope.orgId) || lower(actualExecutor) !== lower(executor)) throw new Error('This organization’s roles changed. Please refresh.');
  const ids = [...new Set([subjectId, fallbackSubjectId].filter(Boolean).map(normalizeSubjectId))];
  const accounts = [...new Set([
    ...candidates, ...snapshot.data.memberships.filter(row => ids.includes(row.subject.subjectId) && row.accepted).map(row => row.user),
  ].map(lower))].sort();
  assertPlanningReadSize(accounts.length, 256, 'election members and candidates');
  const read = planningReadQueue();
  const subjects = await Promise.all(ids.map(async id => {
    const indexed = snapshot.data.subjects.find(row => row.subjectId === id);
    if (indexed?.kind !== 'Role') throw new Error('Choose an available role.');
    const [info, memberCount] = await Promise.all([authority.getSubject(id, overrides), authority.memberCount(id, overrides)]);
    if (!info.exists) throw new Error('This role is no longer available.');
    const statuses = await Promise.all(accounts.map(async account => {
      const row = await read(() => authority.getStatus(id, account, overrides));
      return { account, accepted: row.accepted ?? row[0], eligible: row.eligible_ ?? row[1],
        acceptedAt: String(row.acceptedAt ?? row[2]), ruleKind: Number(row.ruleKind ?? row[3]) };
    }));
    // This revision derives only from same-block indexed configuration/rules, never a clock.
    // The live count/status and preflight checks independently cover the selected members.
    const rulesRevision = utils.id(JSON.stringify([indexed.raw,
      snapshot.data.collections.accessRules.data.filter(row => row.subject?.subjectId === id)]));
    return { subjectId: id, kind: 'Role', maxMembers: String(info.maxMembers), memberCount: String(memberCount), statuses, rulesRevision };
  }));
  const acceptance = await Promise.all(accounts.map(async account => {
    const ids = (await read(() => authority.userSubjects(account, overrides))).map(String);
    return { account, acceptedAnywhere: knownFact(ids.length > 0), acceptedSubjectIds: knownFact(ids) };
  }));
  const context = { source, coverage, data: {
    readiness: { membershipAuthority: { id: scope.contract, isRouterBound: snapshot.data.authority.isRouterBound,
      cutoverAt: snapshot.data.authority.cutoverAt } },
    executorAuthorized: knownFact(true), paused: knownFact(paused), subjects, accounts: acceptance,
  } };
  const elected = subjects.find(row => row.subjectId === normalizeSubjectId(subjectId));
  const preflights = await readRemovalPreflights({ source, subjectId,
    accounts: elected.statuses.filter(row => row.accepted).map(row => row.account),
    reader: {
      canRemove: async request => {
        const row = await read(() => authority.canRemove(request.subjectId, request.account, false, overrides));
        return { source: { ...source, account: request.account }, coverage,
          data: { reason: Number(row.reason ?? row[0]), sourceSet: Number(row.sourceSet ?? row[1]) } };
      },
      getStatus: async request => {
        const row = await read(() => authority.getStatus(request.subjectId, request.account, overrides));
        return { source: { ...source, account: request.account }, coverage,
          data: { accepted: row.accepted ?? row[0], eligible: row.eligible_ ?? row[1],
            acceptedAt: String(row.acceptedAt ?? row[2]), ruleKind: Number(row.ruleKind ?? row[3]) } };
      },
    },
  });
  const after = await provider.getBlock(blockTag);
  assertSourceBlock({ number: String(after.number), hash: after.hash }, observedBlock);
  return { scope, freshness: { now: now(), maxAgeSeconds: 30, block: observedBlock }, context, preflights };
}
