/** Display identity helpers; scoped task actions come from the core-backed board policy. */

/** Task is "mine": assignee address matches, or claimer username matches. */
export function isTaskMine(task, address, graphUsername) {
  if (!task) return false;
  const addr = (address || '').toLowerCase();
  const claimed = (task.claimedBy || '').toLowerCase();
  if (addr && claimed && addr === claimed) return true;
  const gu = (graphUsername || '').toLowerCase();
  const cu = (task.claimerUsername || '').toLowerCase();
  if (gu && cu && gu === cu) return true;
  return false;
}

/** Whether one of my applications on an open task is still pending approval. */
export function hasPendingApplication(task, address, graphUsername) {
  if (!task || !Array.isArray(task.applicants)) return false;
  const addr = (address || '').toLowerCase();
  const gu = (graphUsername || '').toLowerCase();
  return task.applicants.some((a) => {
    if (!a || a.approved) return false;
    const aAddr = (a.address || '').toLowerCase();
    const aUser = (a.username || '').toLowerCase();
    return (addr && aAddr && aAddr === addr) || (gu && aUser && aUser === gu);
  });
}
