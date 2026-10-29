/** Host lifecycle identity. Saved address hints never participate in this scope. */
export function memberTaskError(message) {
  return Object.assign(new Error(message), { userMessage: message });
}

export function taskHostScopeKey(scope) {
  return JSON.stringify([scope.chainId, scope.orgId?.toLowerCase(), scope.contract?.toLowerCase(),
    scope.endpoint, scope.projectId?.toLowerCase(), scope.account?.toLowerCase(), scope.hydrated === true]);
}

export function assertTaskHostScope(current, expected) {
  if (taskHostScopeKey(current) !== taskHostScopeKey(expected)) {
    throw memberTaskError('Your account or organization changed. Please reopen the task and try again.');
  }
}

export function taskMetadataIdentity(task) {
  return JSON.stringify([task?.id?.toLowerCase(), task?.projectId?.toLowerCase(),
    task?.metadataHash?.toLowerCase(), task?.submissionHash?.toLowerCase()]);
}

export function assertCurrentTask(current, expected) {
  if (!current || taskMetadataIdentity(current) !== taskMetadataIdentity(expected)) {
    throw memberTaskError('The saved task details changed. Reload the task and try again.');
  }
}

export const TASK_OPTIMISTIC_GRACE_MS = 65000;

export function remainingTaskLockDelay(timestamp, now = Date.now()) {
  return Math.max(0, TASK_OPTIMISTIC_GRACE_MS - (now - timestamp));
}
