import { expect, it } from 'vitest';
import { createObservationCache } from '@/lib/accessV2/observationCache';
import { createAuthorityObservationStore } from '@/lib/accessV2/authorityEvidence';
it('releases polled block generations while keeping simultaneous subscribers shared', async () => {
  const cache = createObservationCache();
  let reads = 0;
  const create = () => createAuthorityObservationStore(async () => { reads++; return { coverage: { status: 'complete' } }; });
  const current = cache.get('current', create);
  const one = current.subscribe(() => {}), two = current.subscribe(() => {});
  for (let block = 1; block < 100; block++) {
    const store = cache.get(String(block), create);
    const stop = store.subscribe(() => {});
    await store.refresh(); stop(); await Promise.resolve();
  }
  one(); await Promise.resolve();
  expect(cache.get('current', create)).toBe(current);
  await Promise.all([current.refresh(), cache.get('current', create).refresh()]);
  expect(reads).toBe(100);
  expect(cache.size).toBe(1);
  two(); await Promise.resolve(); expect(cache.size).toBe(0);
  for (let block = 0; block < 100; block++) cache.get(String(block), create);
  expect(cache.size).toBe(8);
});
