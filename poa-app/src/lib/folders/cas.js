import { extractRevertEvidence, decodeRevertTree } from '@poa-box/core/errors/envelope';

/** Decode core's diagnostic envelope; only the host's name-only retry hint stays local. */
export function parseFoldersRootStale(error) {
  if (!error) return null;
  const evidence = extractRevertEvidence(error);
  if (evidence.data) {
    for (let decoded = decodeRevertTree(evidence.data); decoded; decoded = decoded.inner) {
      if (decoded.name === 'FoldersRootStale') {
        return { expected: decoded.args[0], actual: decoded.args[1] };
      }
    }
  }
  // Older host error parsers sometimes retain only this name. It authorizes a reload,
  // never a guessed root or automatic overwrite. Bounded diagnostic slots only.
  const queue = [error];
  const seen = new Set();
  while (queue.length && seen.size < 64) {
    const item = queue.shift();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    if (typeof item === 'string') {
      if (item.includes('FoldersRootStale')) return { expected: null, actual: null };
    } else if (typeof item === 'object') {
      queue.push(item.data, item.message, item.reason, item.technicalMessage, item.userMessage,
        item.cause, item.error, item.info?.error, item.originalError);
    }
  }
  return null;
}
