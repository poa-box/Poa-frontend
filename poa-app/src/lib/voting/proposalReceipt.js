/** Core receipt decoding, projected onto the host's existing notification shape. */
import { utils } from 'ethers';
import { HybridVotingNewAbi } from '@poa-box/core/abis/HybridVotingNew';
import { parseProposalCreatedLogs } from '@poa-box/core/tx/governance';
import { parseProposalReceiptOutcome } from '@poa-box/core/tx/vote';

const iface = new utils.Interface(HybridVotingNewAbi);
const parsedLogs = (receipt, contractAddress) => {
  const want = contractAddress ? String(contractAddress).toLowerCase() : null;
  return (Array.isArray(receipt?.logs) ? receipt.logs : []).flatMap(log => {
    if (!log || (want && String(log.address || '').toLowerCase() !== want)) return [];
    try { return [{ log, parsed: iface.parseLog(log) }]; } catch { return []; }
  });
};

export function parseCreatedProposalId(receipt, contractAddress) {
  return parseProposalCreatedLogs(parsedLogs(receipt, contractAddress).map(row => row.parsed)) ?? null;
}

/** Optional proposal ID pins failure evidence to the action the viewer finalized. */
export function parseExecutionFailure(receipt, contractAddress, proposalId) {
  const row = parsedLogs(receipt, contractAddress).find(({ parsed }) => (
    parsed.name === 'ProposalExecutionFailed'
      && (proposalId == null || parsed.args.id.toString() === String(proposalId))
  ));
  if (!row) return null;
  const id = row.parsed.args.id.toString();
  const outcome = parseProposalReceiptOutcome(receipt.logs.filter(log => typeof log?.address === 'string' && Array.isArray(log.topics) && typeof log.data === 'string'), {
    votingAddress: contractAddress || row.log.address,
    // This host helper only consumes voting-module failure events. No Executor event is assumed.
    executorAddress: '0x0000000000000000000000000000000000000000',
    proposalId: id,
  });
  if (outcome.execution.state !== 'known' || outcome.execution.value !== 'failed') return null;
  return { proposalId: id, winningIndex: Number(row.parsed.args.winningIdx.toString()),
    reason: String(row.parsed.args.reason || '0x') };
}

export { parseProposalReceiptOutcome };
export default parseCreatedProposalId;
