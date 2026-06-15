// Pure time/axis math for the Gantt view. No React, no Chakra. Keep this
// thin so we can sanity-check it in isolation — subgraph timestamps come
// as strings of seconds, but Date.now() is ms; one units bug puts every
// bar at year 1970 or 50,000 AD.

const DAY_MS = 86_400_000;

// Normalize any incoming timestamp value (string, number, seconds, ms) to ms.
// Returns NaN for nullish / unparsable inputs so callers can guard.
export function toMs(ts) {
  if (ts == null || ts === '') return NaN;
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(n) || n <= 0) return NaN;
  // 1e12 ms ≈ Sep 2001; any sane recent timestamp in seconds is well below 1e12.
  return n < 1e12 ? n * 1000 : n;
}

// Strip ms back to the start of the day in UTC. Day-cell math should be
// quantized so weekend shading and the today line line up exactly.
export function startOfDayMs(ms) {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms, days) {
  return ms + days * DAY_MS;
}

export function daysBetween(a, b) {
  return Math.round((startOfDayMs(b) - startOfDayMs(a)) / DAY_MS);
}

export function isWeekend(ms) {
  const day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

// First day of UTC month containing ms.
export function startOfMonthMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

// Number of days a `zoom` preset should cover, anchored to today.
const ZOOM_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

// Compute [startMs, endMs] for the chart, quantized to whole days. For
// `all` we scan the tasks for their earliest/latest interesting timestamp
// and pad ±7d. For fixed zoom presets we anchor to today, padded backward
// so the today line sits roughly two-thirds of the way across.
export function getDayRange(tasks, zoom = '30d') {
  const todayStart = startOfDayMs(Date.now());

  if (zoom === 'all') {
    let min = todayStart;
    let max = todayStart;
    for (const t of tasks || []) {
      const c = toMs(t.createdAt);
      const e = toMs(t.completedAt) || toMs(t.submittedAt) || toMs(t.assignedAt);
      if (Number.isFinite(c) && c < min) min = c;
      if (Number.isFinite(e) && e > max) max = e;
      // Deadlines (v6): keep due dates / hard deadlines / claim deadlines inside
      // the range so their markers are never silently clipped. All are unix
      // seconds (or null); toMs normalizes.
      for (const dl of [t.dueDate, t.absoluteDeadline, t.claimDeadline]) {
        const d = toMs(dl);
        if (Number.isFinite(d) && d > max) max = d;
      }
    }
    return [startOfDayMs(addDays(min, -3)), startOfDayMs(addDays(Math.max(max, todayStart), 3))];
  }

  const days = ZOOM_DAYS[zoom] || ZOOM_DAYS['30d'];
  // Past-heavy split: 70% history, 30% lookahead — Gantt's job is mostly
  // diagnostic for what already happened, not forecasting.
  const past = Math.round(days * 0.7);
  const future = days - past;
  return [
    startOfDayMs(addDays(todayStart, -past)),
    startOfDayMs(addDays(todayStart, future + 1)),
  ];
}

// Width helpers — width-in-pixels of one day, given a total chart width
// and the day count we're showing. Capped so dense zooms don't get
// unreadable; floored so sparse zooms don't get spaghetti-thin bars.
export function pxPerDay(chartWidthPx, dayCount) {
  if (!dayCount) return 0;
  const raw = chartWidthPx / dayCount;
  return Math.min(80, Math.max(8, raw));
}

// Convert an absolute timestamp to its X-pixel offset from the chart's
// anchor (the chart's start-of-range ms). Clamped at 0 so left-edge
// overflow doesn't paint outside the chart.
export function dateToPx(ms, anchorMs, perDayPx) {
  if (!Number.isFinite(ms)) return 0;
  const delta = (ms - anchorMs) / DAY_MS;
  return Math.max(0, delta * perDayPx);
}

// Iterate days in [startMs, endMs) inclusive of start, exclusive of end —
// the natural cell-rendering loop for the axis row.
export function eachDay(startMs, endMs, fn) {
  let cursor = startOfDayMs(startMs);
  const end = startOfDayMs(endMs);
  let i = 0;
  while (cursor < end) {
    fn(cursor, i);
    cursor = addDays(cursor, 1);
    i += 1;
  }
}

export const TIME_AXIS_DAY_MS = DAY_MS;
