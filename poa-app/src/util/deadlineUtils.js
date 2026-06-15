/**
 * Deadline utilities for TaskManager v6 task deadlines.
 *
 * Three deadline tiers per task:
 *  - dueDate          soft due date (IPFS metadata, display-only), unix seconds
 *  - absoluteDeadline on-chain calendar cutoff, unix seconds (subgraph: null when unset)
 *  - completionWindow on-chain per-claim duration in seconds (subgraph: null when unset)
 *  - claimDeadline    derived per claim = claimTime + completionWindow (subgraph: null when none)
 *
 * Enforcement is LENIENT: a late claimer can still submit — expiry only opens the
 * claim to takeover by anyone (the contract handles takeover inside claimTask).
 */

export const HOUR_S = 3600;
export const DAY_S = 86400;

/**
 * Normalize a subgraph value (string | number | null) to integer seconds.
 * On-chain `0` / '0' means "unset" and maps to null.
 */
export function toSec(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Soft due date (seconds) from the task object (mapped from metadata.dueDate). */
export function dueDateSec(task) {
  return toSec(task && task.dueDate);
}

/**
 * Effective enforced deadline for the CURRENT claim: min of the non-null
 * claimDeadline / absoluteDeadline. Falls back to assignedAt + completionWindow
 * when claimDeadline hasn't indexed yet (optimistic takeover / subgraph lag).
 * Only meaningful while the task is claimed (columnId 'inProgress').
 */
export function effectiveDeadlineSec(task) {
  if (!task) return null;
  let cd = toSec(task.claimDeadline);
  if (cd === null) {
    const window = toSec(task.completionWindow);
    const assignedAt = toSec(task.assignedAt);
    if (window !== null && assignedAt !== null) cd = assignedAt + window;
  }
  const abs = toSec(task.absoluteDeadline);
  if (cd === null) return abs;
  if (abs === null) return cd;
  return Math.min(cd, abs);
}

/** True when a claimed task's enforcement deadline has strictly passed. */
export function isClaimExpired(task, nowMsValue) {
  const deadline = effectiveDeadlineSec(task);
  if (deadline === null) return false;
  return (nowMsValue !== undefined ? nowMsValue : nowMs()) > deadline * 1000;
}

/** True when the soft due date has passed and the task isn't done. */
export function isOverdueSoft(task, nowMsValue) {
  const due = dueDateSec(task);
  if (due === null) return false;
  if (task && (task.columnId === 'completed' || task.columnId === 'cancelled')) return false;
  return (nowMsValue !== undefined ? nowMsValue : nowMs()) > due * 1000;
}

/** "3d left" | "5h left" | "12m left" | "2h overdue" | "3d overdue" */
export function formatRemaining(sec, nowMsValue) {
  if (sec === null || sec === undefined) return '';
  const now = nowMsValue !== undefined ? nowMsValue : nowMs();
  let delta = Math.round(sec - now / 1000);
  const overdue = delta < 0;
  delta = Math.abs(delta);
  let label;
  if (delta >= DAY_S) label = `${Math.floor(delta / DAY_S)}d`;
  else if (delta >= HOUR_S) label = `${Math.floor(delta / HOUR_S)}h`;
  else label = `${Math.max(1, Math.floor(delta / 60))}m`;
  return overdue ? `${label} overdue` : `${label} left`;
}

/** "Jun 12" (adds the year when not the current one). */
export function formatDeadlineDate(sec) {
  if (sec === null || sec === undefined) return '';
  const d = new Date(sec * 1000);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date(nowMs()).getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

/** Human duration for a completion window: "7 days" | "36 hours" | "90 min". */
export function formatWindow(seconds) {
  const s = toSec(seconds);
  if (s === null) return '';
  if (s % DAY_S === 0) {
    const d = s / DAY_S;
    return `${d} day${d === 1 ? '' : 's'}`;
  }
  if (s % HOUR_S === 0) {
    const h = s / HOUR_S;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  if (s >= 2 * HOUR_S) return `${Math.round(s / HOUR_S)} hours`;
  return `${Math.max(1, Math.round(s / 60))} min`;
}

/** 'none' | 'normal' | 'soon' (<=3d) | 'urgent' (<=24h) | 'overdue' */
export function deadlineSeverity(sec, nowMsValue) {
  if (sec === null || sec === undefined) return 'none';
  const now = (nowMsValue !== undefined ? nowMsValue : nowMs()) / 1000;
  const delta = sec - now;
  if (delta < 0) return 'overdue';
  if (delta <= DAY_S) return 'urgent';
  if (delta <= 3 * DAY_S) return 'soon';
  return 'normal';
}

// Reuse the kanban status hexes (taskUtils COLUMN_COLORS family) for consistency.
export const SEVERITY_HEX = {
  soon: '#F6E05E', // yellow.300
  urgent: '#F6AD55', // orange.300
  overdue: '#FC8181', // red.300
};

// Chakra Badge colorScheme per severity.
export const SEVERITY_SCHEME = {
  normal: 'gray',
  soon: 'yellow',
  urgent: 'orange',
  overdue: 'red',
};

/**
 * Date-only inputs mean "end of that day, local time" — prevents "due Jun 12"
 * reading as overdue at 00:01 on Jun 12.
 */
export function localDateStrToEndOfDaySec(yyyyMmDd) {
  if (!yyyyMmDd) return null;
  const parts = String(yyyyMmDd).split('-');
  if (parts.length !== 3) return null;
  const d = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2]),
    23,
    59,
    59
  );
  const sec = Math.floor(d.getTime() / 1000);
  return Number.isFinite(sec) ? sec : null;
}

/** Unix seconds -> 'YYYY-MM-DD' (local) for <Input type="date"> values. */
export function secToLocalDateStr(sec) {
  const s = toSec(sec);
  if (s === null) return '';
  const d = new Date(s * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Testable "now": dev sessions can time-travel every countdown/badge/banner by
 * setting localStorage['poa.devNowOffsetMs'] (ms to add) and reloading.
 */
export function nowMs() {
  let offset = 0;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      offset = Number(window.localStorage.getItem('poa.devNowOffsetMs')) || 0;
    }
  } catch (e) {
    offset = 0;
  }
  return Date.now() + offset;
}
