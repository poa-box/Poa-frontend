// Outcomes from a hedged IPFS fetch (Helia raced against the HTTP gateway).
//
//   p2pWin       — Helia returned valid bytes first.
//   gatewayWin   — Gateway returned first (Helia was slow, errored, or both).
//   gatewayOnly  — Helia was disabled at init time; gateway ran alone.
//   failure      — Both paths failed; the user saw an error.
//
// p2p hit rate (p2pWin / total) tells us how often decentralized retrieval
// is actually winning. A high `gatewayOnly` count means Helia init is
// failing in production (esm.sh, IDB, CSP). Any non-zero `failure` is an
// alert — the user-facing fallback didn't catch.
const counters = {
  p2pWin: 0,
  gatewayWin: 0,
  gatewayOnly: 0,
  failure: 0,
};

let totalFetches = 0;
let visibilityListenerAttached = false;

const DUMP_EVERY_N_FETCHES = 20;

function ensureVisibilityListener() {
  if (visibilityListenerAttached) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') dumpMetrics();
  });
  visibilityListenerAttached = true;
}

export function recordOutcome(kind) {
  if (kind in counters) counters[kind] += 1;
  totalFetches += 1;
  ensureVisibilityListener();
  if (totalFetches % DUMP_EVERY_N_FETCHES === 0) dumpMetrics();
}

export function dumpMetrics() {
  const total = counters.p2pWin + counters.gatewayWin + counters.gatewayOnly + counters.failure;
  const p2pAttempted = counters.p2pWin + counters.gatewayWin;
  const p2pRate = p2pAttempted > 0 ? ((counters.p2pWin / p2pAttempted) * 100).toFixed(1) : 'n/a';
  console.info(
    `[IPFS metrics] p2pWin=${counters.p2pWin} gatewayWin=${counters.gatewayWin} gatewayOnly=${counters.gatewayOnly} failure=${counters.failure} total=${total} (p2p hit rate=${p2pRate}%)`,
  );
}
