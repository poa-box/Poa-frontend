/** Transport work bound only; all requested rows must still finish or planning fails. */
export function planningReadQueue(limit = 20) {
  let active = 0;
  const pending = [];
  const drain = () => {
    while (active < limit && pending.length) {
      const { read, resolve, reject } = pending.shift();
      active++;
      Promise.resolve().then(read).then(resolve, reject).finally(() => { active--; drain(); });
    }
  };
  return read => new Promise((resolve, reject) => { pending.push({ read, resolve, reject }); drain(); });
}

export function assertPlanningReadSize(count, limit, kind) {
  if (count <= limit) return;
  const error = new Error(`This review supports up to ${limit} ${kind}. Contact support for an extended review before continuing.`);
  error.code = 'PLANNING_READ_LIMIT';
  error.limit = limit;
  error.observedCount = count;
  throw error;
}
