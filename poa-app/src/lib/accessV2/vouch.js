/**
 * accessV2/vouch — the vouch attestor (ACCESS-V2-SPEC.md §2), ported from v1's EligibilityModule
 * vouching with two semantic changes the UI has to reflect:
 *
 *   1. combine-mode is GONE. An attestor can only ALLOW; it can never override a BAN, and an
 *      explicit governance GRANT is now effective on a vouch-gated role (v1's combine=false
 *      silently ignored it — Decentral Park's Agent role).
 *   2. The admin-fallback voucher branch is DELETED. Vouchers are exclusively MEMBERS of the
 *      config's voucher subject.
 *
 * EPOCHS: `resetVouchEpoch` bumps the config epoch; every record written at an older epoch counts
 * as ZERO without any per-record event. `clearUserVouches` strands a single user's records the same
 * way. So a record is live iff `active && epoch === config.epoch`, and the count the UI shows must
 * be computed that way rather than read off a stale counter.
 *
 * PURE.
 */

import { toSubjectId } from '@/lib/accessV2/ids';
import { predictAuthorityLints, LINT_CODE as CORE_LINT_CODE } from '@poa-box/core/authority/lifecycle';
import { normalizeSubjectId } from '@poa-box/core/authority/ids';
import { projectSubjectMembership } from '@poa-box/core/authority/permissions';
import { knownFact } from '@poa-box/core/data/facts';

/** Normalise a subgraph SubjectVouchConfig row. */
export function normalizeVouchConfig(raw) {
  if (!raw) return null;
  const subjectId = toSubjectId(raw.subject?.subjectId ?? raw.subject?.id ?? raw.id);
  const quorum = Number(raw.quorum ?? 0);
  const voucherSubjectId = toSubjectId(raw.voucherSubjectId ?? raw.voucherSubject?.subjectId) ?? '0';
  return {
    subjectId,
    quorum,
    enabled: quorum > 0,
    voucherSubjectId,
    voucherSubjectName: raw.voucherSubject?.name || '',
    // Legal and live (KUBI: Execs vouch for Execs). Only an EMPTY self-vouching subject deadlocks,
    // and that is recoverable with a governance grant — the contract lints it, never reverts.
    selfVouching: Boolean(subjectId) && subjectId === voucherSubjectId,
    epoch: String(raw.epoch ?? '0'),
    configuredAt: raw.configuredAt ? Number(raw.configuredAt) : null,
  };
}

/** Normalise a subgraph SubjectVouchRecord row. */
export function normalizeVouchRecord(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    subjectId: toSubjectId(raw.subject?.subjectId ?? raw.subject?.id ?? raw.subjectId),
    user: String(raw.user || '').toLowerCase(),
    voucher: String(raw.voucher || '').toLowerCase(),
    voucherUsername: raw.voucherUsername || null,
    active: Boolean(raw.active),
    seeded: Boolean(raw.seeded),
    epoch: String(raw.epoch ?? '0'),
    vouchedAt: raw.vouchedAt ? Number(raw.vouchedAt) : null,
    revokedAt: raw.revokedAt ? Number(raw.revokedAt) : null,
  };
}

export function normalizeVouchRecords(rows = []) {
  return (rows || []).map(normalizeVouchRecord).filter(Boolean);
}

/**
 * Records that still COUNT: active AND written at the config's current epoch.
 * A stale-epoch record is dead with no event of its own — filtering here is the only thing that
 * keeps the UI's count honest after a `resetVouchEpoch`.
 */
export function liveRecords(records = [], config) {
  const epoch = String(config?.epoch ?? '0');
  return (records || []).filter((r) => r && r.active && String(r.epoch) === epoch);
}

/**
 * Quorum progress for one (subject, user).
 * @returns {{ count: number, quorum: number, met: boolean, remaining: number, vouchers: string[] }}
 */
export function vouchProgress(records = [], config) {
  const live = liveRecords(records, config);
  const quorum = Number(config?.quorum ?? 0);
  return {
    count: live.length,
    quorum,
    met: quorum > 0 && live.length >= quorum,
    remaining: quorum > 0 ? Math.max(0, quorum - live.length) : 0,
    vouchers: live.map((r) => r.voucher),
    stale: (records || []).length - live.length,
  };
}

/** Has this voucher already vouched (live) for this user? `vouch` reverts AlreadyVouched. */
export function hasVouched(records = [], config, voucher) {
  const v = String(voucher || '').toLowerCase();
  if (!v) return false;
  return liveRecords(records, config).some((r) => r.voucher === v);
}

/**
 * May `viewer` vouch here? The contract's checks, replayed so the button can explain itself.
 *
 * @param {object} opts
 * @param {object} opts.config - normalised vouch config
 * @param {Array} opts.records - normalised records for this (subject, user)
 * @param {string} opts.viewer - connected address
 * @param {string} opts.target - the user being vouched for
 * @param {boolean} opts.viewerIsVoucherMember - is viewer a member of config.voucherSubjectId
 * @param {boolean} [opts.paused]
 * @returns {{ can: boolean, reason: string|null }}
 */
/**
 * Is the viewer a member of the config's VOUCHER SUBJECT — which may be a GROUP?
 *
 * `SubjectMembership` rows exist for ROLE subjects only: groups have no acceptance, so the subgraph
 * folds no membership row for them (schema.graphql) and the app derives group rosters instead. A
 * membership-row lookup therefore answers "no" for every group, while on chain the vouch is legal
 * and works — `configureVouchAttestor` only forbids the VOUCHED subject being a group, and
 * `vouch()` checks `_isMember(cfg.voucherSubject, msg.sender)`, which resolves a group through its
 * member roles (MembershipAuthorityLogic._isMember). "Executives-group vouches for X" would show
 * every legitimate voucher a disabled button reading "Only members of <group> can vouch here".
 *
 * @param {string} voucherSubjectId
 * @param {Array} subjects - normalised subjects (groups carry `memberRoleIds`)
 * @param {(subjectId: string) => boolean} isMemberOf - the viewer's role-membership predicate
 * @returns {boolean}
 */
export function isMemberOfVoucherSubject(voucherSubjectId, subjects = [], isMemberOf) {
  const id = toSubjectId(voucherSubjectId);
  if (!id || id === '0' || typeof isMemberOf !== 'function') return false;
  const subject = (subjects || []).find((s) => s?.subjectId === id);
  // Direct ROLE facts remain available before the subject roster arrives.
  if (!subject) return isMemberOf(id) === true;
  const data = {
    subjects: (subjects || []).filter(Boolean).map(s => ({ subjectId: s.subjectId, kind: s.isGroup ? 'Group' : 'Role', name: s.name ?? null })),
    permissions: [],
    groupEdges: (subjects || []).filter(s => s?.isGroup).flatMap(group => (group.memberRoleIds || []).map(role => ({ id: `${group.subjectId}:${role}`, groupSubjectId: group.subjectId, roleSubjectId: role, isActive: true }))),
  };
  const memberships = data.subjects.filter(s => s.kind === 'Role').map(s => ({ subjectId: s.subjectId, isMember: knownFact(isMemberOf(s.subjectId) === true) }));
  const fact = projectSubjectMembership(data, id, memberships);
  return fact.state === 'known' && fact.value;
}

export function canVouch({ config, records = [], viewer, target, viewerIsVoucherMember, paused = false }) {
  if (!config || !config.enabled) return { can: false, reason: 'Vouching is not enabled for this role.' };
  if (paused) return { can: false, reason: 'Membership changes are paused for this org right now.' };
  const me = String(viewer || '').toLowerCase();
  const them = String(target || '').toLowerCase();
  if (!me) return { can: false, reason: 'Connect your account to vouch.' };
  if (me === them) return { can: false, reason: 'You cannot vouch for yourself.' };
  if (!viewerIsVoucherMember) {
    const who = config.voucherSubjectName || 'the designated role';
    return { can: false, reason: `Only members of ${who} can vouch here.` };
  }
  if (hasVouched(records, config, me)) {
    return { can: false, reason: 'You have already vouched for them — you can revoke it instead.' };
  }
  return { can: true, reason: null };
}

/** The progress sentence, e.g. "2 of 3 vouches — 1 more needed". */
export function vouchProgressCopy(progress) {
  if (!progress || progress.quorum === 0) return null;
  if (progress.met) return `${progress.count} of ${progress.quorum} vouches — qualified.`;
  return `${progress.count} of ${progress.quorum} vouches — ${progress.remaining} more needed.`;
}

/**
 * CONFIG-TIME LINTS (§2) — non-reverting warnings the contract emits and the config UI should
 * show BEFORE the write, not after. Mirrors `AccessV2Types.LintCode`.
 */
export const LINT_CODE = Object.fromEntries(Object.entries(CORE_LINT_CODE).map(([name, code]) => [code, name]));

export const LINT_COPY = {
  QuorumNoOp:
    'This role is open to everyone, so the vouch requirement does nothing — everyone already qualifies.',
  VouchWithMaxMembers:
    'Seats are limited AND vouch-gated: someone whose vouches lapse still occupies a seat until a repair runs, which can block new members.',
  DefaultAllowStrongPerms:
    'This role is open to everyone and carries real power (voting, task or budget permissions). That is a deliberate hazard — make sure it is intended.',
  GroupFanout:
    'This permission is attached to a lot of groups. Every group in the list costs a full membership scan on each check, which makes voting and task actions expensive.',
  SelfVoucher:
    'Members of this role vouch for this role. That is fine once it has members — but an EMPTY role cannot bootstrap itself, so grant the first member by vote.',
};

/**
 * Predict the lints a config write would trigger, so the wizard warns BEFORE the vote is opened.
 * Deliberately mirrors the contract's conditions and nothing more.
 */
export function predictLints({ defaultAllow, vouchQuorum, maxMembers, hasStrongPerms, voucherSubjectId, subjectId } = {}) {
  const codes = predictAuthorityLints({
    subjectId: subjectId ?? '0', voucherSubjectId: voucherSubjectId ?? '0',
    defaultAllow: defaultAllow === true, vouchQuorum: vouchQuorum ?? 0, maxMembers: maxMembers ?? 0,
    permCount: hasStrongPerms ? 1 : 0, groupFanout: 0,
  });
  return codes.map((code) => ({ code: LINT_CODE[code], message: LINT_COPY[LINT_CODE[code]] }));
}

/**
 * An unsaved form has no allocated subject ID. Model only its explicit self-vouch
 * choice with numeric witnesses for the core's equality check, never an allocation
 * prediction. Keep a selected external ID strict and choose a distinct witness,
 * including when it is zero. An unanswered picker is distinct too; roleFormError
 * still blocks it. These witnesses must never enter the form or a submitted plan.
 */
export function predictDraftLints({ selfVouch = false, voucherSubjectId, ...config } = {}) {
  const voucher = selfVouch ? '0'
    : voucherSubjectId === '' || voucherSubjectId == null ? '1' : normalizeSubjectId(voucherSubjectId);
  const subject = selfVouch || voucher !== '0' ? '0' : '1';
  return predictLints({ ...config, subjectId: subject, voucherSubjectId: voucher });
}
