import { projectTaskApplicant } from '@poa-box/core/reads/task';
import { decideTaskActions } from '@poa-box/core/tasks/policy';
import { knownFact, unknownFact, assertPlanScope, assertSourceBlock } from '@poa-box/core/data/facts';
import { parseProjectId } from '@poa-box/core/encoding';
import { PERM_BITS } from '@poa-box/core/perms';
import { EXPIRY_SKEW_BUFFER_MS } from '@/util/releaseGate';

const statuses = { Open: 0, Assigned: 1, Submitted: 2, Completed: 3, Cancelled: 4 };
const zero = `0x${'0'.repeat(40)}`;
const unknown = () => unknownFact('TASK_FACT_UNAVAILABLE');
const fact = value => value === undefined || value === null ? unknown() : knownFact(value);

/** Role-aware empty states/chips are presentation, not permission to act on a task. */
export function projectHasReviewCapability({ scope, project, authority }) {
  try {
    if (!scope.hydrated || !scope.account || project?.taskCoverage?.status !== 'complete'
        || project.taskCoverage.issues.length || !authority) return false;
    assertPlanScope(authority.scope, { chainId: scope.chainId, orgId: scope.orgId,
      contract: scope.contract, endpoint: scope.endpoint, account: scope.account });
    assertPlanScope(project.taskSource, { chainId: scope.chainId, orgId: scope.orgId,
      contract: scope.contract, endpoint: scope.endpoint });
    if (authority.source && project.taskSource.block) assertSourceBlock(authority.source.block, project.taskSource.block);
    const manager = project.managerFact;
    if (manager?.source && project.taskSource.block) assertSourceBlock(manager.source.block, project.taskSource.block);
    if (manager?.source) assertPlanScope(manager.source, { chainId: scope.chainId, orgId: scope.orgId,
      account: scope.account, contract: scope.contract, endpoint: scope.endpoint });
    return (authority.permissionMask.state === 'known' && (BigInt(authority.permissionMask.value) & BigInt(PERM_BITS.review)) !== 0n)
      || (authority.executor.state === 'known' && authority.executor.value)
      || (manager?.state === 'known' && manager.value);
  } catch { return false; }
}

function seconds(value) {
  if (value === null) return knownFact(0);
  if (value === undefined || !/^\d+$/.test(String(value))) return unknown();
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? knownFact(parsed) : unknown();
}

/** Authority facts are supplied by the authority host hook, never reconstructed from role arrays. */
export function taskActionPolicy({ scope, project, task, authority, now, releasesSupported }) {
  const projectId = project ? parseProjectId(project.id) : `0x${'0'.repeat(64)}`;
  const source = project?.taskSource || { ...scope, indexed: true, snapshot: 'unknown', method: 'task-board' };
  let qualifiedAuthority = authority;
  try {
    if (!scope.hydrated || !authority?.scope) throw new Error('Unresolved authority');
    assertPlanScope(authority.scope, { chainId: scope.chainId, orgId: scope.orgId,
      account: scope.account, contract: scope.contract, endpoint: scope.endpoint });
    if (authority.projectId?.toLowerCase() !== projectId.toLowerCase()) throw new Error('Wrong project');
  } catch { qualifiedAuthority = null; }
  const matches = !!task && task.projectId?.toLowerCase() === project?.id?.toLowerCase();
  const policyScope = { ...scope, contracts: qualifiedAuthority?.scope.contracts };
  const snapshot = { source: { ...source, account: scope.account, contracts: policyScope.contracts },
    coverage: project?.taskCoverage || { status: 'unavailable', receivedKeys: [], missingIds: [], failedIds: [], issues: [] },
    data: {
      projectId: project ? knownFact(projectId) : unknown(),
      actor: scope.hydrated && scope.account ? knownFact(scope.account) : unknown(),
      executor: qualifiedAuthority?.executor || unknown(),
      projectManager: project?.managerFact || unknown(),
      permissionMask: qualifiedAuthority?.permissionMask || unknown(),
      projectExists: fact(!!project), creator: qualifiedAuthority?.creator || unknown(),
      taskExists: matches && !task.isIndexing ? knownFact(true) : unknown(),
      status: matches ? fact(statuses[task.status]) : unknown(),
      claimer: matches && task.claimedBy !== undefined ? knownFact(task.claimedBy || zero) : unknown(),
      absoluteDeadline: matches ? seconds(task.absoluteDeadline) : unknown(),
      claimDeadline: matches ? seconds(task.claimDeadline) : unknown(),
      requiresApplication: matches ? fact(task.requiresApplication) : unknown(),
      alreadyApplied: task?.applicationsEvidence ? projectTaskApplicant({ applications: task.applicationsEvidence,
        task: task.id, block: source.block, scope }) : unknown(),
    } };
  const input = { projectId, scope: policyScope, snapshot, projectCreator: qualifiedAuthority?.projectCreator, now: Math.floor(now / 1000) };
  const decisions = decideTaskActions(input);
  // Browser clocks can run ahead of the chain. Keep the host's one-minute
  // confirmation buffer for third-party releases, using the same core policy.
  if (task?.claimedBy?.toLowerCase() !== scope.account?.toLowerCase()) {
    decisions.release = decideTaskActions({ ...input, now: Math.max(0, input.now - EXPIRY_SKEW_BUFFER_MS / 1000) }).release;
  }
  // Host veto: the current endpoint must index a release before offering one.
  if (!releasesSupported) decisions.release = { state: 'denied', reasons: ['INCOMPLETE_SOURCE'] };
  if (task?.isIndexing) {
    for (const action of Object.keys(decisions)) if (!['create', 'createAndAssign', 'budget', 'deleteProject'].includes(action)) {
      decisions[action] = { state: 'unknown', reasons: ['INCOMPLETE_SOURCE'] };
    }
  }
  return decisions;
}
