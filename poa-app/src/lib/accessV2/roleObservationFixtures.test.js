import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, operationFixture, operationHistoricalFixture, roleId, groupId } from '@/lib/accessV2/roleObservationFixtures';
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('packed-role fixture indexed inputs through installed authority reader', () => {
  it('derives complete source-qualified collections from explicit selected response rows', async () => {
    const f = await operationFixture(), snapshot = f.input.snapshot;
    expect(snapshot.coverage.status, JSON.stringify(snapshot.coverage)).toBe('complete');
    expect(snapshot.data.ready).toMatchObject({ state: 'known', value: true });
    expect(snapshot.data.subjects.map(row => row.subjectId)).toEqual([roleId, groupId].sort());
    expect(Object.keys(snapshot.data.collections)).toHaveLength(7);
    for (const [method, collection] of Object.entries(snapshot.data.collections)) {
      expect(collection.source.method).toBe(method); expect(collection.coverage.status).toBe('complete');
      expect(collection.source.block).toEqual(snapshot.source.block);
    }
    expect(snapshot.data.authority.subjectCount).toBe('2'); expect(f.calls).toEqual([]);
  });
  it('preserves the historical exact-response fixture without inventing provenance markers', async () => {
    const f = await operationHistoricalFixture();
    expect(f.input.snapshot.coverage.status).toBe('complete'); expect(f.indexedResponse.proposals[0]).not.toHaveProperty('createsSubject');
    expect(f.provider.getTransaction).not.toHaveBeenCalled();
  });
  it('retains unavailable coverage when the actual page block differs', async () => {
    const f = fixture(); f.indexedResponse._meta.block.hash = `0x${'ef'.repeat(32)}`;
    const snapshot = await f.readAuthority(); expect(snapshot.coverage.status).not.toBe('complete'); expect(snapshot.data.ready.state).toBe('unknown');
  });
});
