/**
 * Task utility functions for the POA Task Manager
 * Shared across web3Context, TaskBoardContext, and TaskColumn components
 */

import { MINUTES_STEP } from '@poa-box/core/payout';
export { parseTaskId, parseModuleId } from '@/services/web3/utils/encoding';

// Pure pricing conventions stay outside the lazy wallet/service runtime.
export {
    DIFFICULTY_CONFIG, DEFAULT_HOURLY_RATE, normalizeHourlyRate,
    calculatePayout, formatEstTime,
} from '@poa-box/core/payout';

/**
 * Task durations are stored as decimal hours (e.g. 0.25 = 15 min) in IPFS and
 * the subgraph, but when an org pays by hours only they're entered and shown to
 * members in 15-minute steps. These helpers convert between the stored decimal
 * hours and the hours + minutes the UI works with.
 */
export { MINUTES_STEP };
export const HOURS_STEP = MINUTES_STEP / 60; // 0.25

/**
 * Split a decimal-hours value into whole hours plus a 0/15/30/45 minute
 * remainder. Anything off-grid (e.g. a legacy 0.7h task) is snapped to the
 * nearest 15-minute mark so the picker always has a valid selection.
 * @param {number|string} hours
 * @returns {{hours: number, minutes: number}}
 */
export function splitHoursMinutes(hours) {
    const totalMin = Math.round(Number(hours) * 60);
    const safeMin = Number.isFinite(totalMin) && totalMin > 0 ? totalMin : 0;
    const snapped = Math.round(safeMin / MINUTES_STEP) * MINUTES_STEP;
    return { hours: Math.floor(snapped / 60), minutes: snapped % 60 };
}

/**
 * Combine whole hours + minutes back into decimal hours. Multiples of 15
 * minutes map to exact quarters (15→0.25, 30→0.5, 45→0.75) with no float dust.
 * @param {number|string} hours
 * @param {number|string} minutes
 * @returns {number}
 */
export function combineHoursMinutes(hours, minutes) {
    const h = Math.max(0, Math.floor(Number(hours) || 0));
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    return h + m / 60;
}

/**
 * Map subgraph task status to frontend column ID
 */
export const STATUS_TO_COLUMN = {
    'Open': 'open',
    'Assigned': 'inProgress',
    'Submitted': 'inReview',
    'Completed': 'completed',
    'Cancelled': null, // Filtered out
};

/**
 * Map frontend column ID to display title
 */
export const COLUMN_TITLES = {
    'open': 'Open',
    'inProgress': 'In Progress',
    'inReview': 'In Review',
    'completed': 'Completed',
};

/**
 * Canonical difficulty palette — green.300 / yellow.300 / orange.300 / red.300.
 * Single source of truth for cards, rows, and gantt rows.
 */
export const DIFFICULTY_COLORS = {
    easy: '#68D391',
    medium: '#F6E05E',
    hard: '#F6AD55',
    veryhard: '#FC8181',
};

/**
 * Returns the canonical hex color for a difficulty, normalizing case and
 * stripping the space that "very hard" sometimes carries. Falls back to a
 * neutral gray for unknown/missing values.
 */
export function getDifficultyColor(diff) {
    if (!diff) return '#CBD5E0';
    const key = String(diff).toLowerCase().replace(' ', '');
    return DIFFICULTY_COLORS[key] || '#CBD5E0';
}

/**
 * Number of dots to render for a given difficulty — used by cards and rows.
 */
export const DIFFICULTY_DOTS = { easy: 1, medium: 2, hard: 3, veryhard: 4 };

/**
 * Column color palette — mirrors the kanban swimlane treatment so other
 * views (list groupings, gantt bars) can stay visually consistent.
 */
export const COLUMN_COLORS = {
    open: '#68D391',       // green.300
    inProgress: '#9F7AEA', // purple.400
    inReview: '#F6E05E',   // yellow.300
    completed: '#A0AEC0',  // gray.400
};
