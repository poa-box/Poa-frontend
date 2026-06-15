import { describe, it, expect } from 'vitest';
import {
  toSec,
  dueDateSec,
  effectiveDeadlineSec,
  isClaimExpired,
  isOverdueSoft,
  formatRemaining,
  formatWindow,
  deadlineSeverity,
  localDateStrToEndOfDaySec,
  secToLocalDateStr,
  DAY_S,
  HOUR_S,
} from './deadlineUtils';

const T = 1_900_000_000; // base unix seconds
const T_MS = T * 1000;

describe('toSec', () => {
  it('normalizes subgraph strings', () => {
    expect(toSec('1900000000')).toBe(1900000000);
    expect(toSec(1900000000)).toBe(1900000000);
  });
  it('maps unset sentinels to null', () => {
    expect(toSec(null)).toBeNull();
    expect(toSec(undefined)).toBeNull();
    expect(toSec(0)).toBeNull();
    expect(toSec('0')).toBeNull();
    expect(toSec('')).toBeNull();
    expect(toSec('garbage')).toBeNull();
  });
});

describe('effectiveDeadlineSec', () => {
  it('returns null with no deadlines', () => {
    expect(effectiveDeadlineSec({})).toBeNull();
    expect(effectiveDeadlineSec(null)).toBeNull();
  });
  it('uses claimDeadline alone', () => {
    expect(effectiveDeadlineSec({ claimDeadline: String(T) })).toBe(T);
  });
  it('uses absoluteDeadline alone', () => {
    expect(effectiveDeadlineSec({ absoluteDeadline: T })).toBe(T);
  });
  it('takes the min of both', () => {
    expect(
      effectiveDeadlineSec({ claimDeadline: T + 100, absoluteDeadline: T })
    ).toBe(T);
    expect(
      effectiveDeadlineSec({ claimDeadline: T, absoluteDeadline: T + 100 })
    ).toBe(T);
  });
  it('falls back to assignedAt + completionWindow when claimDeadline missing', () => {
    expect(
      effectiveDeadlineSec({ assignedAt: String(T), completionWindow: String(DAY_S) })
    ).toBe(T + DAY_S);
  });
});

describe('isClaimExpired / isOverdueSoft', () => {
  const task = { claimDeadline: T };
  it('is protected at the deadline second', () => {
    expect(isClaimExpired(task, T_MS)).toBe(false);
  });
  it('expires strictly past the deadline', () => {
    expect(isClaimExpired(task, T_MS + 1001)).toBe(true);
  });
  it('never expires without deadlines', () => {
    expect(isClaimExpired({}, T_MS)).toBe(false);
  });
  it('soft overdue ignores completed tasks', () => {
    expect(isOverdueSoft({ dueDate: T, columnId: 'open' }, T_MS + 1001)).toBe(true);
    expect(isOverdueSoft({ dueDate: T, columnId: 'completed' }, T_MS + 1001)).toBe(false);
  });
});

describe('formatRemaining', () => {
  it('formats days/hours/minutes left', () => {
    expect(formatRemaining(T + 3 * DAY_S, T_MS)).toBe('3d left');
    expect(formatRemaining(T + 5 * HOUR_S, T_MS)).toBe('5h left');
    expect(formatRemaining(T + 12 * 60, T_MS)).toBe('12m left');
  });
  it('formats overdue', () => {
    expect(formatRemaining(T - 2 * HOUR_S, T_MS)).toBe('2h overdue');
    expect(formatRemaining(T - 3 * DAY_S, T_MS)).toBe('3d overdue');
  });
});

describe('formatWindow', () => {
  it('whole days', () => {
    expect(formatWindow(7 * DAY_S)).toBe('7 days');
    expect(formatWindow(DAY_S)).toBe('1 day');
  });
  it('hours and minutes', () => {
    expect(formatWindow(36 * HOUR_S)).toBe('36 hours');
    expect(formatWindow(90 * 60)).toBe('90 min');
  });
  it('unset', () => {
    expect(formatWindow(0)).toBe('');
    expect(formatWindow(null)).toBe('');
  });
});

describe('deadlineSeverity', () => {
  it('classifies bands', () => {
    expect(deadlineSeverity(null, T_MS)).toBe('none');
    expect(deadlineSeverity(T + 10 * DAY_S, T_MS)).toBe('normal');
    expect(deadlineSeverity(T + 2 * DAY_S, T_MS)).toBe('soon');
    expect(deadlineSeverity(T + HOUR_S, T_MS)).toBe('urgent');
    expect(deadlineSeverity(T - 1, T_MS)).toBe('overdue');
  });
});

describe('date input round trip', () => {
  it('end-of-day semantics', () => {
    const sec = localDateStrToEndOfDaySec('2030-06-15');
    const d = new Date(sec * 1000);
    expect(d.getFullYear()).toBe(2030);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(23);
    expect(secToLocalDateStr(sec)).toBe('2030-06-15');
  });
  it('rejects garbage', () => {
    expect(localDateStrToEndOfDaySec('')).toBeNull();
    expect(localDateStrToEndOfDaySec(null)).toBeNull();
  });
});
