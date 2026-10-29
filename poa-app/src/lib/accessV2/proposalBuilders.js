/** Live governance view adapters. Protocol encoding and planning are core-owned. */
import { planRoleRemovals } from '@poa-box/core/governance/elections';
import { projectContext } from '@poa-box/core/tx/authority';
import { parseProjectId } from '@/services/web3/utils/encoding';
import { buildSetPerm, buildClearPerm } from '@/lib/accessV2/txBuilders';
import { PERM_KEYS, GLOBAL_CTX, boolPermWord, maskPermWord, foldTag, FOLD_TAG } from '@/lib/accessV2/permKeys';
import { buildRoleRemovalSummaries, roleRemovalConfigError } from '@/lib/accessV2/roleRemoval';

export function estimateBatchGas(batch = []) {
  const BASE = 400_000;
  const PER_CALL = 250_000;
  return BASE + PER_CALL * (batch || []).length;
}

export function projectCtx(projectId) {
  if (projectId === null || projectId === undefined) return GLOBAL_CTX;
  const s = String(projectId).trim();
  if (s === '') return GLOBAL_CTX;
  // Composite subgraph id. Narrowly detected so the plain forms below keep their exact behaviour:
  // parseProjectId's last resort is to KECCAK an unrecognised string, which would turn a short hex
  // id like '0xabc' into an unrelated ctx.
  const raw = /^0x[0-9a-fA-F]{40}-/.test(s) ? parseProjectId(s) : s;
  let pid;
  try {
    pid = BigInt(raw);
  } catch {
    throw new Error(`accessV2: "${projectId}" is not a project id`);
  }
  return projectContext(pid.toString());
}

export function buildPermRows(perms = {}, projectPerms = []) {
  const rows = [];
  for (const [name, value] of Object.entries(perms || {})) {
    const key = PERM_KEYS[name];
    if (!key) continue;
    if (foldTag(key) === FOLD_TAG.OR_MASK) {
      const mask = Number(value) || 0;
      if (mask <= 0) continue;
      rows.push({ permKey: key, ctx: GLOBAL_CTX, word: maskPermWord(mask, { inheritGlobal: false }) });
    } else {
      if (!value) continue;
      rows.push({ permKey: key, ctx: GLOBAL_CTX, word: boolPermWord(true) });
    }
  }
  for (const p of projectPerms || []) {
    // Nullish/empty means "no project named", NOT project 0 — TaskManager ids start at 0, so a
    // falsy test here would silently drop every rule about the first project an org ever made.
    if (!p || p.projectId === null || p.projectId === undefined || p.projectId === '') continue;
    const mask = Number(p.mask) || 0;
    // A present zero with inheritance disabled deliberately suppresses this subject's global
    // task grants for the project; omitting it would restore those grants.
    if (mask <= 0 && p.inheritGlobal !== false) continue;
    // NEW project rows default to inherit=true. That is deliberate: v1's implicit REPLACE is the
    // twice-bitten shadowing bug where a role's global grant went silently dead inside a project.
    rows.push({
      permKey: PERM_KEYS.TM_PERMS,
      ctx: projectCtx(p.projectId),
      word: maskPermWord(mask, { inheritGlobal: p.inheritGlobal !== false }),
    });
  }
  return rows;
}

export function buildEditPermsBatch({ authority, subjectId, subjectName = 'this role', currentRows = [], nextRows = [] }) {
  const keyOf = (r) => `${String(r.permKey).toLowerCase()}|${String(r.ctx).toLowerCase()}`;
  const current = new Map((currentRows || []).map((r) => [keyOf(r), r]));
  const next = new Map((nextRows || []).map((r) => [keyOf(r), r]));

  const batch = [];
  const summaries = [];

  for (const [k, row] of next) {
    const before = current.get(k);
    if (before && String(before.word) === String(row.word)) continue;
    batch.push(buildSetPerm(authority, subjectId, row.permKey, row.ctx, row.word));
    summaries.push(`${before ? 'Change' : 'Add'} a permission on ${subjectName}`);
  }
  for (const [k, row] of current) {
    if (next.has(k)) continue;
    batch.push(buildClearPerm(authority, subjectId, row.permKey, row.ctx));
    summaries.push(`Remove a permission from ${subjectName}`);
  }

  return { batch, summaries, warnings: [], createsSubject: false, gasLimit: estimateBatchGas(batch) };
}

export function buildRoleRemovalBatch({
  authority,
  subjectId,
  subjectName = 'this role',
  members = [],
  confirmBans = false,
  liveReconciled = false,
  planningEvidence = null,
}) {
  const config = { subjectId, subjectName, members, confirmBans, liveReconciled };
  const error = roleRemovalConfigError(config);
  if (error) throw new Error(error);

  if (planningEvidence) {
    const plan = planRoleRemovals({ ...planningEvidence,
      scope: { ...planningEvidence.scope, contract: authority }, subjectId,
      removals: members.map(member => ({ account: member.address, ban: Boolean(member.ban),
        expectedReason: member.expectedReason, expectedSourceSet: member.expectedSourceSet })),
      confirmedBans: confirmBans ? planningEvidence.confirmedBans || [] : [],
    });
    if (plan.status !== 'ready') {
      const failure = new Error('The selected removals could not be verified. Refresh the role and review the selection again.');
      failure.planningCodes = plan.codes;
      throw failure;
    }
    const batch = plan.data[0].map(call => ({ target: call.target, value: String(call.value), data: call.calldata }));
    return { batch, summaries: buildRoleRemovalSummaries(config), warnings: [], createsSubject: false,
      gasLimit: estimateBatchGas(batch), plan };
  }
  throw new Error('Refresh the current role settings and review these removals before continuing.');
}
