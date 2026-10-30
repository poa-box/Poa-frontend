import { parseTaskCreatedReceipt } from '@poa-box/core/tasks/receipts';
import { unknownFact } from '@poa-box/core/data/facts';

function containedOperationLogs(logs, outerLogs) {
  let cursor = 0;
  return logs.every(log => {
    while (cursor < outerLogs.length) {
      const candidate = outerLogs[cursor++];
      if (candidate.address?.toLowerCase() === log.address?.toLowerCase()
          && candidate.data === log.data && JSON.stringify(candidate.topics) === JSON.stringify(log.topics)) return true;
    }
    return false;
  });
}

/** A direct TaskService creation is one call; bundled logs require transport-owned isolation. */
export function taskCreatedIdsFromResult(result, taskManagerAddress, creations,
  { requiresOperationScope = false, directCreationCall = false } = {}) {
  if (result?.success !== true || !result.receipt) return unknownFact('RECEIPT_NOT_SUCCESSFUL');
  const operation = result.creationOperation;
  const outerLogs = result.receipt.logs ?? [];
  if (requiresOperationScope && (!operation || operation.success !== true
      || operation.taskManagerAddress?.toLowerCase() !== taskManagerAddress.toLowerCase()
      || !Array.isArray(operation.logs) || !containedOperationLogs(operation.logs, outerLogs))) {
    return unknownFact('CREATION_OPERATION_SCOPE_UNAVAILABLE');
  }
  const status = result.receipt.status;
  return parseTaskCreatedReceipt({ taskManagerAddress,
    status: status === 'success' || status === '0x1' || status === 1n ? 1 : status,
    logs: requiresOperationScope ? operation.logs : outerLogs, creations,
    ...((requiresOperationScope ? operation.creationLogScope === 'ordered-single-operation' : directCreationCall)
      ? { creationLogScope: 'ordered-single-operation' } : {}),
  });
}
