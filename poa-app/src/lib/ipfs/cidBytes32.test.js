import { afterEach, describe, expect, it, vi } from 'vitest';
import { CID } from 'multiformats/cid';
import { create as createDigest } from 'multiformats/hashes/digest';
import { ethers } from 'ethers';
import { bytes32ToIpfsCid, ipfsCidToBytes32 } from '@/lib/ipfs/cidBytes32';

afterEach(() => vi.restoreAllMocks());

describe('content addressing without wallet dependencies', () => {
  it.each([0, 1, 127, 255])('round-trips a SHA-256 digest through CIDv0 (%i)', (seed) => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => (seed + i) % 256);
    const expectedCid = CID.createV0(createDigest(0x12, bytes)).toString();
    const hash = ethers.utils.hexlify(bytes);
    expect(bytes32ToIpfsCid(hash)).toBe(expectedCid);
    expect(ipfsCidToBytes32(expectedCid)).toBe(hash);
  });

  it('preserves existing hex and UTF-8 fallback behavior', () => {
    const hash = `0x${'AB'.repeat(32)}`;
    expect(ipfsCidToBytes32(hash)).toBe(hash);
    for (const input of ['legacy project name', 'Community 🌱', 'bafy-legacy-fallback']) {
      expect(ipfsCidToBytes32(input)).toBe(ethers.utils.id(input));
    }
    // ethers rejects malformed UTF-16 rather than hashing replacement bytes.
    expect(() => ipfsCidToBytes32('\ud800')).toThrow();
  });

  it.each([null, undefined, ''])('keeps empty addressing behavior (%s)', (input) => {
    expect(ipfsCidToBytes32(input)).toBe(ethers.constants.HashZero);
    expect(bytes32ToIpfsCid(input)).toBeNull();
  });

  it('treats the zero hash as absent', () => {
    expect(bytes32ToIpfsCid(ethers.constants.HashZero)).toBeNull();
  });

  it('retains byte-array inputs accepted by the existing decoder', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    expect(bytes32ToIpfsCid(bytes)).toBe(bytes32ToIpfsCid(ethers.utils.hexlify(bytes)));
  });

  it('keeps invalid hex/CID failures recoverable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(bytes32ToIpfsCid('0x1')).toBeNull();
    expect(bytes32ToIpfsCid('not hex')).toBeNull();
    expect(ipfsCidToBytes32('Qm0-invalid-base58')).toBe(ethers.constants.HashZero);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledOnce();
  });
});
