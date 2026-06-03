/**
 * Task utility functions for the POA Task Manager
 * Shared across web3Context, TaskBoardContext, and TaskColumn components
 */

/**
 * Parse a task ID from the POP subgraph format.
 * Subgraph format: "taskManagerAddress-taskId"
 * @param {string|number} taskId - The task ID from the subgraph or direct input
 * @returns {string} - The numeric task ID portion for contract calls
 */
export function parseTaskId(taskId) {
    const taskIdStr = taskId.toString();
    return taskIdStr.includes("-") ? taskIdStr.split("-")[1] : taskIdStr;
}

/**
 * Parse a module ID from the POP subgraph format.
 * @param {string|number} moduleId - The module ID from the subgraph
 * @returns {string} - The numeric module ID for contract calls
 */
export function parseModuleId(moduleId) {
    const moduleIdStr = moduleId.toString();
    return moduleIdStr.includes('-') ? moduleIdStr.split('-')[1] : moduleIdStr;
}

/**
 * Difficulty configuration for payout calculation
 * Base payout + (multiplier * estimated hours) = total payout
 */
export const DIFFICULTY_CONFIG = {
    easy: { base: 1, multiplier: 16.5 },
    medium: { base: 4, multiplier: 24 },
    hard: { base: 10, multiplier: 30 },
    veryHard: { base: 25, multiplier: 37.5 },
};

/**
 * Default tokens-per-hour rate for orgs that opt into hours-only payouts
 * (the "Pay by hours only" org setting). Used when no rate is configured.
 */
export const DEFAULT_HOURLY_RATE = 10;

/**
 * Normalize a configured hourly rate to a positive finite number, falling
 * back to DEFAULT_HOURLY_RATE for missing/invalid values.
 * @param {*} value - Raw rate (from org metadata / settings input)
 * @returns {number}
 */
export function normalizeHourlyRate(value) {
    const rate = Number(value);
    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_HOURLY_RATE;
}

/**
 * Calculate task payout.
 *
 * Default mode: difficulty-weighted — base + (multiplier * estimated hours).
 * Hours-only mode: when `payoutConfig.hoursOnly` is set (the org-level "Pay by
 * hours only" setting), difficulty is ignored and payout is simply
 * rate * estimated hours, where rate defaults to DEFAULT_HOURLY_RATE.
 *
 * @param {string} difficulty - The difficulty level (easy, medium, hard, veryHard)
 * @param {number} estimatedHours - The estimated hours to complete the task
 * @param {{hoursOnly?: boolean, hourlyRate?: number}} [payoutConfig] - Optional org payout config
 * @returns {number} - The calculated payout amount
 */
export function calculatePayout(difficulty, estimatedHours, payoutConfig) {
    if (payoutConfig?.hoursOnly) {
        return Math.round(normalizeHourlyRate(payoutConfig.hourlyRate) * estimatedHours);
    }
    const config = DIFFICULTY_CONFIG[difficulty];
    if (!config) {
        console.warn(`Unknown difficulty: ${difficulty}, defaulting to medium`);
        return calculatePayout('medium', estimatedHours);
    }
    return Math.round(config.base + config.multiplier * estimatedHours);
}

/**
 * Task durations are stored as decimal hours (e.g. 0.25 = 15 min) in IPFS and
 * the subgraph, but when an org pays by hours only they're entered and shown to
 * members in 15-minute steps. These helpers convert between the stored decimal
 * hours and the hours + minutes the UI works with.
 */
export const MINUTES_STEP = 15;
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
 * Format a decimal-hours duration as a compact "1h 30m" / "45m" / "2h" label.
 * Rounds to the nearest minute so stored values like 0.25 render as "15m"
 * rather than "0.25 hrs". Used everywhere a task's estimated time is shown
 * while an org pays by hours only.
 * @param {number|string} hours
 * @returns {string}
 */
export function formatEstTime(hours) {
    const totalMin = Math.round(Number(hours) * 60);
    if (!Number.isFinite(totalMin) || totalMin <= 0) return '0m';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
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
