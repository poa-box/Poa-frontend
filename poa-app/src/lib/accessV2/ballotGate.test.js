import { describe, expect, it } from 'vitest';
import { ballotActivation } from '@/lib/accessV2/ballotGate';

describe('unqualified activation inputs', () => {
  it('keeps even convincing unqualified rows indeterminate', () => {
    for (const rows of [[], [{ subjectId: '1', isMember: true, acceptedAt: 200, seededWhilePaused: false }]]) {
      expect(ballotActivation({ enabled: true, loading: false, rows, proposalCreatedAt: '100' })).toMatchObject({ checked: false, blocked: false });
    }
  });
  it('does not evaluate while authority is disabled or loading', () => {
    for (const input of [{ enabled: false }, { enabled: true, loading: true }]) {
      expect(ballotActivation(input)).toMatchObject({ checked: false, blocked: false });
    }
  });
});
