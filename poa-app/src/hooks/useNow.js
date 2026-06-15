import { useEffect, useState } from 'react';
import { nowMs } from '@/util/deadlineUtils';

// Shared interval registry: one timer per interval value feeding all subscribers,
// so a board of ~100 countdown badges re-renders once per tick, not per card.
const registries = new Map(); // intervalMs -> { timer, subs:Set<fn> }

function subscribe(intervalMs, fn) {
  let reg = registries.get(intervalMs);
  if (!reg) {
    reg = { timer: null, subs: new Set() };
    reg.timer = setInterval(() => {
      const t = nowMs();
      reg.subs.forEach((s) => s(t));
    }, intervalMs);
    registries.set(intervalMs, reg);
  }
  reg.subs.add(fn);
  return () => {
    reg.subs.delete(fn);
    if (reg.subs.size === 0) {
      clearInterval(reg.timer);
      registries.delete(intervalMs);
    }
  };
}

/**
 * Ticking "now" in ms (respects the poa.devNowOffsetMs dev override), quantized
 * to the interval so memoized children don't re-render more than once per tick.
 *
 * Cards use 30s, the task modal 15s, the gantt 60s.
 */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => nowMs());
  useEffect(() => subscribe(intervalMs, setNow), [intervalMs]);
  return Math.floor(now / intervalMs) * intervalMs;
}

export default useNow;
