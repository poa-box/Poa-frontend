import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchClaimEmail } from '@/lib/zkemail/claimInbox';
import { rawEmailString, rawEmailBytes, readRawEmail, normalizeInboxEmail } from '@/lib/zkemail/rawEmail';

const octets = Uint8Array.from({ length: 256 }, (_, value) => value);
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('lossless manual, current-worker and already-deployed inbox transport', () => {
  it('roundtrips every byte and a multi-chunk file without UTF8 decoding', async () => {
    expect(rawEmailBytes(rawEmailString(octets))).toEqual(octets);
    const large = Uint8Array.from({ length: 100000 }, (_, value) => value % 256);
    expect(rawEmailBytes(await readRawEmail({ arrayBuffer: async () => large.buffer }))).toEqual(large);
  });
  it('inverts the exact old worker WHATWG latin1 -> JSON convention for all 256 octets', async () => {
    const oldWorkerJson = JSON.stringify({ status: 'ready', eml: new TextDecoder('latin1').decode(octets) });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => JSON.parse(oldWorkerJson) })));
    expect(rawEmailBytes(await fetchClaimEmail('https://inbox.example.test', 'synthetic'))).toEqual(octets);
    expect(rawEmailBytes(normalizeInboxEmail(rawEmailString(octets)))).toEqual(octets);
  });
  it('never guesses unsupported Unicode encodings', () => {
    expect(() => rawEmailBytes('real Unicode €')).toThrow('raw email bytes');
    expect(() => normalizeInboxEmail('unsupported Unicode 😀')).toThrow('unsupported email encoding');
  });
  it('also times out a hanging response body, and aborts a pending request on scope cleanup', async () => {
    vi.useFakeTimers();
    const network = vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) }));
    vi.stubGlobal('fetch', network);
    const first = fetchClaimEmail('https://inbox.example.test', 'synthetic', { timeoutMs: 100 });
    const rejected = expect(first).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100); await rejected;
    expect(network.mock.calls[0][1].signal.aborted).toBe(true);
    const controller = new AbortController();
    const second = fetchClaimEmail('https://inbox.example.test', 'synthetic', { signal: controller.signal });
    controller.abort(); await expect(second).rejects.toThrow('cancelled');
    expect(network.mock.calls[1][1].signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
});
