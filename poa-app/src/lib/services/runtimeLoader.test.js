import { describe, expect, it, vi } from 'vitest';
import { createRuntimeLoader } from './runtimeLoader';

describe('shared runtime loading', () => {
  it('shares one successful import for concurrent and later consumers', async () => {
    const runtime = { default: () => null };
    const importer = vi.fn().mockResolvedValue(runtime);
    const load = createRuntimeLoader(importer);
    const first = load();
    expect(load()).toBe(first);
    expect(await first).toBe(runtime);
    expect(await load()).toBe(runtime);
    expect(importer).toHaveBeenCalledTimes(1);
  });
  it('allows a failed import to be retried without stranding subscribers', async () => {
    const error = new Error('Chunk load failed');
    const importer = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ default: 'runtime' });
    const load = createRuntimeLoader(importer);
    await expect(load()).rejects.toBe(error);
    await expect(load()).resolves.toEqual({ default: 'runtime' });
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
