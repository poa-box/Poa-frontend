const counters = {
  p2pHit: 0,
  p2pMiss: 0,
  p2pTimeout: 0,
  gatewayFallback: 0,
  gatewayFailure: 0,
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
  if (kind in counters) {
    counters[kind] += 1;
  }
  totalFetches += 1;
  ensureVisibilityListener();
  if (totalFetches % DUMP_EVERY_N_FETCHES === 0) {
    dumpMetrics();
  }
}

export function dumpMetrics() {
  const total =
    counters.p2pHit +
    counters.p2pMiss +
    counters.p2pTimeout +
    counters.gatewayFallback +
    counters.gatewayFailure;
  const p2pRate = total > 0 ? ((counters.p2pHit / total) * 100).toFixed(1) : '0.0';
  console.info(
    `[IPFS metrics] p2pHit=${counters.p2pHit} p2pTimeout=${counters.p2pTimeout} p2pMiss=${counters.p2pMiss} gatewayFallback=${counters.gatewayFallback} gatewayFailure=${counters.gatewayFailure} (p2p hit rate=${p2pRate}%)`,
  );
}

export function getMetricsSnapshot() {
  return { ...counters, totalFetches };
}
