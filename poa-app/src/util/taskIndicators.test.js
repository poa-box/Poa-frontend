import { describe, it, expect } from 'vitest';
import { isTaskMine, hasPendingApplication } from '@/util/taskIndicators';

const MANAGER = `0x${'12'.repeat(20)}`;
const EXECUTOR = `0x${'34'.repeat(20)}`;

describe('isTaskMine', () => {
  it('matches on claimer address or username, case-insensitively', () => {
    expect(isTaskMine({ claimedBy: MANAGER.toUpperCase() }, MANAGER, '')).toBe(true);
    expect(isTaskMine({ claimerUsername: 'Hudson' }, '', 'hudson')).toBe(true);
    expect(isTaskMine({ claimedBy: EXECUTOR }, MANAGER, 'hudson')).toBe(false);
    expect(isTaskMine(null, MANAGER, 'hudson')).toBe(false);
  });
});

describe('hasPendingApplication', () => {
  it('ignores already-approved applications', () => {
    const task = { applicants: [{ address: MANAGER, approved: true }] };
    expect(hasPendingApplication(task, MANAGER, '')).toBe(false);
  });

  it('finds a pending application by address or username', () => {
    expect(hasPendingApplication({ applicants: [{ address: MANAGER }] }, MANAGER, '')).toBe(true);
    expect(hasPendingApplication({ applicants: [{ username: 'Hudson' }] }, '', 'hudson')).toBe(true);
  });
});
