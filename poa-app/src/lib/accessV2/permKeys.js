/**
 * accessV2/permKeys — the semantic permission-key table (ACCESS-V2-SPEC.md §3).
 *
 * PURE. Mirrors `src/libs/AccessV2PermKeys.sol` exactly, INCLUDING the derivation, so a key added
 * in Solidity is one line here and never a magic constant:
 *
 *     key = (tag << 248) | (keccak256(label) >> 8)
 *
 * The FOLD TAG is the key's TOP BYTE — 0x00 bool-any, 0x01 OR-mask, 0x02 reserved MAX. The
 * authority folds keys it has never seen, so a new module is a new key constant here + a rulebook
 * entry + a subgraph template, and NEVER a contract change.
 *
 * The stored perm WORD packs three things into one slot:
 *   bit 255  EXISTS          — the row is present (vs. a zero word meaning "no row")
 *   bit 254  INHERIT_GLOBAL  — combine this ctx row with the subject's global row
 *   bits 0..253  VALUE       — bool-any: nonzero = true; OR-mask: the TaskManager bitmask
 */

import { permissionKey, permissionWord, AUTHORITY_KEYS, EXISTS_BIT as CORE_EXISTS_BIT, INHERIT_GLOBAL_BIT as CORE_INHERIT_GLOBAL_BIT, VALUE_MASK as CORE_VALUE_MASK } from '@poa-box/core/tx/authority';
import { decodePermissionWord, resolvePermissionContext } from '@poa-box/core/authority/permissions';
import { knownFact } from '@poa-box/core/data/facts';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';

/** Fold tags (top byte of the key). */
export const FOLD_TAG = {
  BOOL_ANY: 0x00,
  OR_MASK: 0x01,
  MAX: 0x02, // RESERVED — unused in v1
};

const TAG_LABEL = {
  [FOLD_TAG.BOOL_ANY]: 'bool-any',
  [FOLD_TAG.OR_MASK]: 'or-mask',
  [FOLD_TAG.MAX]: 'max',
};

/** `(tag << 248) | (keccak256(label) >> 8)` as a 0x-prefixed bytes32. */
export function derivePermKey(tag, label) {
  return permissionKey(label, tag);
}

/** The fold tag encoded in a key's top byte. */
export function foldTag(key) {
  const b = BigInt(key);
  return Number(b >> 248n);
}

export function foldTagLabel(key) {
  return TAG_LABEL[foldTag(key)] || 'unknown';
}

/**
 * The protocol key set. `ctx` documents the ONLY ctx a key is meaningful at:
 * 'global' means ctx must be bytes32(0); 'project' means the key also takes a projectId ctx.
 */
export const PERM_KEYS = AUTHORITY_KEYS;

/** key (lowercased hex) -> constant name, for rendering an indexed PermRow. */
export const PERM_KEY_NAMES = Object.entries(PERM_KEYS).reduce((acc, [name, key]) => {
  acc[key.toLowerCase()] = name;
  return acc;
}, {});

export function permKeyName(key) {
  if (!key) return null;
  return PERM_KEY_NAMES[String(key).toLowerCase()] || null;
}

/**
 * User-facing permission catalogue — what the create-role wizard renders as checkboxes.
 * `group` clusters them; `help` is the one-line explainer next to the box.
 * Order is the render order.
 */
export const PERM_CATALOGUE = [
  {
    id: 'DD_VOTE',
    key: PERM_KEYS.DD_VOTE,
    label: 'Vote in community votes',
    help: 'Can vote in polls.',
    group: 'Polls & votes',
  },
  {
    id: 'DD_CREATE',
    key: PERM_KEYS.DD_CREATE,
    label: 'Open a community vote',
    help: 'Can start a poll.',
    group: 'Polls & votes',
  },
  {
    id: 'HV_CREATE',
    key: PERM_KEYS.HV_CREATE,
    label: 'Open a binding vote',
    help: 'Can start a binding vote (one that does something when it passes).',
    group: 'Polls & votes',
  },
  {
    id: 'TM_PERMS',
    key: PERM_KEYS.TM_PERMS,
    label: 'Task permissions',
    help: 'Which task actions it can take. Choose the specific actions below.',
    group: 'Tasks',
    mask: true,
  },
  {
    id: 'PT_MEMBER',
    key: PERM_KEYS.PT_MEMBER,
    label: 'Hold Shares',
    help: 'Can receive and hold Shares.',
    group: 'Shares',
  },
  {
    id: 'PT_APPROVE',
    key: PERM_KEYS.PT_APPROVE,
    label: 'Approve Shares requests',
    help: 'Can approve other people’s Shares requests.',
    group: 'Shares',
  },
  {
    id: 'EDU_CREATE',
    key: PERM_KEYS.EDU_CREATE,
    label: 'Create learning modules',
    help: 'Can publish education-hub modules.',
    group: 'Learning',
  },
  {
    id: 'EDU_MEMBER',
    key: PERM_KEYS.EDU_MEMBER,
    label: 'Take learning modules',
    help: 'Can complete education-hub modules and earn their rewards.',
    group: 'Learning',
  },
  {
    id: 'PAY_CREATE',
    key: PERM_KEYS.PAY_CREATE,
    label: 'Create payments',
    help: 'Can raise payments from the treasury payment manager.',
    group: 'Treasury',
  },
  {
    id: 'SUBJECT_RENAME',
    key: PERM_KEYS.SUBJECT_RENAME,
    label: 'Edit role & group details',
    help: 'Can change the name, image and description of any role or group.',
    group: 'Organization',
  },
];

/** Display only: protocol keys and grant semantics never depend on the label. */
export function permissionCatalogue(tokenLabel = DEFAULT_TOKEN_LABEL) {
  return PERM_CATALOGUE.map(entry => entry.id === 'PT_MEMBER'
    ? { ...entry, label: `Hold ${tokenLabel}`, help: `Can receive and hold ${tokenLabel}.`, group: tokenLabel }
    : entry.id === 'PT_APPROVE'
      ? { ...entry, label: `Approve ${tokenLabel} requests`, help: `Can approve other people’s ${tokenLabel} requests.`, group: tokenLabel }
      : entry);
}

/**
 * QJ_AUTOJOIN is a real permission key, but it is a JOINING behaviour ("everyone who joins the org
 * is auto-added to this role"), not something a member reasons about in a permission checklist. It
 * is configured in the RoleForm Joining step and still encodes through `buildPermRows` from
 * `form.perms.QJ_AUTOJOIN`, so it is deliberately kept OUT of the catalogue above rather than
 * dropped. See `lib/accessV2/joinConfig`.
 */
export const AUTOJOIN_PERM_ID = 'QJ_AUTOJOIN';

/**
 * TaskManager permission bits — the VALUE of a TM_PERMS row (OR-mask fold).
 * Identical bit values to TaskPerm.sol / `src/util/permissions.js`; v2 drops the uint8 saturation
 * so the value field is a full 254-bit word, but the meaningful bits are unchanged.
 */
export const TASK_PERM_BITS = [
  { value: 1, id: 'CREATE', label: 'Create new tasks' },
  { value: 2, id: 'CLAIM', label: 'Claim tasks' },
  { value: 4, id: 'REVIEW', label: 'Review completed tasks' },
  { value: 8, id: 'ASSIGN', label: 'Assign tasks to others' },
  { value: 16, id: 'SELF_REVIEW', label: 'Complete their own claimed task' },
  { value: 32, id: 'BUDGET', label: 'Edit project budgets' },
  { value: 64, id: 'EDIT_META', label: 'Edit task title / metadata' },
  { value: 128, id: 'EDIT_FULL', label: 'Edit task payout, bounty & metadata' },
];

/** Short bit names for a TaskManager mask, e.g. 5 -> ['CREATE', 'REVIEW']. */
export function taskPermLabels(mask) {
  const m = BigInt(mask ?? 0);
  return TASK_PERM_BITS.filter((b) => (m & BigInt(b.value)) === BigInt(b.value)).map((b) => b.id);
}

// ── Word packing ───────────────────────────────────────────────────────────────────────────────

export const EXISTS_BIT = BigInt(CORE_EXISTS_BIT.toString());
export const INHERIT_GLOBAL_BIT = BigInt(CORE_INHERIT_GLOBAL_BIT.toString());
export const VALUE_MASK = BigInt(CORE_VALUE_MASK.toString());

/**
 * Pack a perm word.
 * @param {{ value?: bigint|number|string, inheritGlobal?: boolean, exists?: boolean }} opts
 * @returns {string} decimal uint256 string (what the contract takes and the subgraph stores)
 */
export function encodePermWord({ value = 0n, inheritGlobal = false, exists = true } = {}) {
  const packed = BigInt(permissionWord(String(value ?? 0), inheritGlobal).toString());
  return (exists ? packed : packed & ~EXISTS_BIT).toString();
}

/** The inverse of {@link encodePermWord}. Never throws on a garbage row. */
export function decodePermWord(word) {
  try {
    const decoded = decodePermissionWord(String(word ?? 0));
    return { ...decoded, enabled: decoded.exists && decoded.enabled };
  } catch {
    return { ...decodePermissionWord('0'), enabled: false };
  }
}

/** A bool-any grant word: exists + value 1. */
export function boolPermWord(enabled = true) {
  return encodePermWord({ value: enabled ? 1n : 0n, exists: true });
}

/** An OR-mask grant word for TaskManager. */
export function maskPermWord(mask, { inheritGlobal = true } = {}) {
  return encodePermWord({ value: BigInt(mask ?? 0), inheritGlobal });
}

/** ctx == bytes32(0) is the GLOBAL scope. */
export const GLOBAL_CTX = `0x${'0'.repeat(64)}`;

export function isGlobalCtx(ctx) {
  if (!ctx) return true;
  try {
    return BigInt(ctx) === 0n;
  } catch {
    return false;
  }
}

/**
 * §3 CTX RESOLUTION, replayed client-side so the UI can show the EFFECTIVE value of a row
 * without an eth_call:
 *   project row exists ? (inheritGlobal ? COMBINE(global, project) : project) : global
 * COMBINE is the key's fold tag: OR for masks, logical-any for booleans.
 *
 * @param {string} key - permKey (its top byte selects the fold)
 * @param {object|null} globalRow - decoded row at ctx 0, or null
 * @param {object|null} projectRow - decoded row at the project ctx, or null
 * @returns {{ value: string, source: 'project'|'global'|'combined'|'none' }}
 */
export function resolvePermCtx(key, globalRow, projectRow) {
  const raw = (row) => row?.exists ? encodePermWord(row) : null;
  const result = resolvePermissionContext({
    permKey: key, global: knownFact(raw(globalRow)), project: knownFact(raw(projectRow)),
  });
  if (result.state !== 'known') return { value: '0', source: 'none' };
  const { value, source } = result.value;
  // Presentation distinguishes no row from a present disabled row.
  if (!projectRow?.exists && !globalRow?.exists) return { value: '0', source: 'none' };
  return { value, source: projectRow?.exists && projectRow.inheritGlobal && !globalRow?.exists ? 'project' : source };
}
