import { arrayify, hexlify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { toUtf8Bytes } from '@ethersproject/strings';
import bs58 from 'bs58';

const ZERO_HASH = `0x${'0'.repeat(64)}`;

// Keep content addressing independent of wallet/provider initialization. These
// small ethers utilities preserve the existing byte and UTF-8 semantics without
// importing the full ethers namespace into every organization read.
export function ipfsCidToBytes32(cid) {
  if (!cid || cid === '') return ZERO_HASH;
  if (!cid.startsWith('Qm')) {
    if (cid.startsWith('0x') && cid.length === 66) return cid;
    return keccak256(toUtf8Bytes(cid));
  }
  try {
    return hexlify(bs58.decode(cid).slice(2));
  } catch (error) {
    console.error('Failed to encode IPFS CID to bytes32:', error);
    return ZERO_HASH;
  }
}

export function bytes32ToIpfsCid(bytes32Hash) {
  if (!bytes32Hash || bytes32Hash === ZERO_HASH) return null;
  try {
    return bs58.encode(new Uint8Array([0x12, 0x20, ...arrayify(bytes32Hash)]));
  } catch (error) {
    console.warn('Failed to decode bytes32 to IPFS CID:', error);
    return null;
  }
}
