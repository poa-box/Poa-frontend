import { arrayify, hexlify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { toUtf8Bytes } from '@ethersproject/strings';
import { cidV0ToBytes32, bytes32ToCidV0 } from '@poa-box/core/encoding/cid';

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
    return cidV0ToBytes32(cid, { strict: false });
  } catch (error) {
    console.error('Failed to encode IPFS CID to bytes32:', error);
    return ZERO_HASH;
  }
}

export function bytes32ToIpfsCid(bytes32Hash) {
  if (!bytes32Hash || bytes32Hash === ZERO_HASH) return null;
  try {
    return bytes32ToCidV0(hexlify(arrayify(bytes32Hash)), { strict: false });
  } catch (error) {
    console.warn('Failed to decode bytes32 to IPFS CID:', error);
    return null;
  }
}
