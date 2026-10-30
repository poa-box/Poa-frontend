/** Canonical protocol codecs; keep the lightweight CID adapter on public readers. */
export {
  stringToBytes,
  bytesToString,
  stringToBytes32,
  parseTaskId,
  parseModuleId,
  parseProjectId,
  formatAddress,
  isValidAddress,
  toChecksumAddress,
} from '@poa-box/core/encoding';
export { ipfsCidToBytes32, bytes32ToIpfsCid } from '@/lib/ipfs/cidBytes32';
