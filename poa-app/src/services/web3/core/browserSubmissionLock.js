/** Web Locks own the live lease. Persistent storage records uncertainty, never lock expiry. */
const serverLocks = new Set();
export function createBrowserSubmissionLock(name, locks) {
  return {
    async acquire() {
      const browser = typeof window !== 'undefined';
      const manager = locks || (browser ? globalThis.navigator?.locks : null);
      if (!manager?.request) {
        // Server-only execution has no competing browser tabs. Browsers must fail closed.
        if (browser) throw new Error('Account actions need browser coordination. Please use a supported browser.');
        if (serverLocks.has(name)) throw new Error('Another action is already in progress for this account.');
        serverLocks.add(name);
        let active = true;
        const release = () => { active = false; serverLocks.delete(name); };
        release.assert = () => { if (!active) throw new Error('This signing session is no longer active.'); };
        return release;
      }
      return new Promise((resolve, reject) => {
        let releaseWait;
        const wait = new Promise(done => { releaseWait = done; });
        // ifAvailable avoids queued wallet prompts suddenly appearing after a different tab finishes.
        let request;
        request = Promise.resolve(manager.request(name, { mode: 'exclusive', ifAvailable: true }, async lock => {
          if (!lock) { reject(new Error('Another action is already in progress for this account.')); return; }
          let active = true;
          const release = () => { active = false; releaseWait(); return request; };
          release.assert = () => { if (!active) throw new Error('This signing session is no longer active.'); };
          resolve(release);
          try { await wait; } finally { active = false; }
        })).catch(reject);
      });
    },
  };
}
