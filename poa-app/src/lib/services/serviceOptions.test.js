import { describe, expect, it, vi } from 'vitest';
import { selectServiceOptions } from './serviceOptions';

describe('shared service options compatibility', () => {
  const services = { task: {}, voting: {}, education: {}, tokenRequest: {}, user: {}, membershipAuthority: {}, treasury: {} };
  it('retains the default, null IPFS fallback and historical network behavior', () => {
    const ipfs = {};
    const create = vi.fn();
    for (const options of [{}, { ipfsService: null }, { ipfsService: ipfs }, { network: 'gnosis' }]) {
      expect(selectServiceOptions(services, ipfs, options, create)).toBe(services);
    }
    expect(create).not.toHaveBeenCalled();
  });
  it('uses a custom IPFS service in every storage-aware domain without mutating shared services', () => {
    const custom = {};
    const selected = selectServiceOptions(services, {}, { ipfsService: custom }, (name, ipfs) => ({ name, ipfs }));
    for (const name of ['task', 'voting', 'education', 'tokenRequest']) expect(selected[name]).toEqual({ name, ipfs: custom });
    for (const name of ['user', 'membershipAuthority', 'treasury']) expect(selected[name]).toBe(services[name]);
    expect(services.task).toEqual({});
  });
  it('preserves signed-out null services with an override', () => {
    const signedOut = { task: null, voting: null };
    expect(selectServiceOptions(signedOut, {}, { ipfsService: {} }, vi.fn())).toBe(signedOut);
  });
});
