import { describe, expect, it } from 'vitest';
import { planningReadQueue } from '@/lib/accessV2/planningReadQueue';
import { observeElection } from '@/lib/accessV2/electionObservation';

it('keeps read concurrency bounded while retaining every result and failure', async () => {
  const read = planningReadQueue();
  let active = 0, peak = 0;
  const results = await Promise.allSettled(Array.from({ length: 55 }, (_, index) => read(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (index === 21) throw new Error('Mock read failed');
    return index;
  })));
  expect(peak).toBe(20);
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(54);
  expect(results[54]).toEqual({ status: 'fulfilled', value: 54 });
  expect(results[21].status).toBe('rejected');
});

describe('extended planning is explicitly unavailable', () => {
  it('does not silently truncate an election with more than 256 relevant accounts', async () => {
    const authority = `0x${'1'.repeat(40)}`, executor = `0x${'2'.repeat(40)}`;
    const scope = { chainId: 100, orgId: 'organization', contract: authority };
    const source = { ...scope, endpoint: 'https://index.example', method: 'fixture', indexed: true,
      snapshot: 'pinned', block: { number: '123' } };
    const calls = [];
    const live = { executor: async () => executor, orgId: async () => scope.orgId, paused: async () => false,
      getStatus: () => { calls.push('status'); } };
    await expect(observeElection({ scope, executor, subjectId: '1', now: () => 1000,
      candidates: Array.from({ length: 257 }, (_, index) => `0x${(index + 10).toString(16).padStart(40, '0')}`),
      snapshot: { source, coverage: { status: 'complete', receivedKeys: [], failedIds: [], missingIds: [], issues: [] }, data: { memberships: [] } },
      readFactory: { createReadOnly: () => live, provider: { getNetwork: async () => ({ chainId: 100 }),
        getBlock: async () => ({ number: 123, timestamp: 1000 }) } },
    })).rejects.toMatchObject({ code: 'PLANNING_READ_LIMIT', limit: 256, observedCount: 257,
      message: expect.stringContaining('Contact support') });
    expect(calls).toEqual([]);
  });
});
