import { unknownFact, assertPlanScope, assertSourceBlock, requireCompleteSnapshot } from '@poa-box/core/data/facts';

/** Use the authority host's project projection at the board's actual indexed block. */
export function projectTaskAuthorityFacts({ authority, projectId, scope, source, projectCreator }) {
  const unknown = () => unknownFact('CURRENT_AUTHORITY_UNAVAILABLE');
  const result = { scope, projectId, permissionMask: unknown(), executor: unknown(), creator: unknown() };
  if (!scope.hydrated || !scope.account || !authority.enabled || authority.error || !source) return result;
  try {
    const snapshot = authority.snapshot;
    const expected = { chainId: scope.chainId, orgId: scope.orgId, endpoint: scope.endpoint,
      contract: authority.scope?.contract };
    requireCompleteSnapshot(snapshot, { scope: expected, indexed: true, snapshot: 'pinned' });
    if (source.snapshot !== 'pinned') return result;
    assertSourceBlock(snapshot.source.block, source.block);
    assertPlanScope(source, { chainId: scope.chainId, orgId: scope.orgId,
      contract: scope.contract, endpoint: scope.endpoint });
    const projected = authority.taskPolicyForProject(projectId, scope.account);
    assertPlanScope(projected.scope, { chainId: scope.chainId, orgId: scope.orgId,
      endpoint: scope.endpoint, contract: scope.contract, account: scope.account });
    return { ...projected, source: snapshot.source, authorityEvidence: snapshot,
      // Keep mixed-source creator observations separate from indexed task facts.
      // Core revalidates that original input when deciding project deletion.
      creator: unknown(), projectCreator };
  } catch { return result; }
}

/** During a refresh React may still hold the prior view for one render. */
export function isCurrentBoardProject(project, read) {
  try {
    if (!read || !project?.taskSource) return false;
    const { chainId, orgId, contract, endpoint } = read.source;
    requireCompleteSnapshot({ source: project.taskSource, coverage: project.taskCoverage, data: null },
      { scope: { chainId, orgId, contract, endpoint }, indexed: true, snapshot: 'pinned', block: read.source.block });
    return true;
  } catch { return false; }
}
