/**
 * TaskBoard Styles
 * Centralized style definitions for TaskBoard components
 */

export const glassLayerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '3xl',
  backgroundColor: 'rgba(0, 0, 0, .45)',
};

export const mobileGlassStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '16px',
  backgroundColor: 'rgba(0, 0, 0, .6)',
  boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
};

export const mobileNavGlassStyle = {
  backgroundColor: 'rgba(0, 0, 0, .8)',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
};

/**
 * Visual height of the fixed-bottom mobile column tab bar (Phase 2),
 * excluding the iOS safe-area inset (the bar absorbs that separately
 * via `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 8px)`).
 * Exposed as a constant so TaskBoardMobile can match the column
 * paddingBottom + FAB offset against it without drift.
 */
export const TAB_BAR_HEIGHT_PX = 56;

/**
 * Fixed bottom bar for column navigation on mobile. Bakes in
 * `env(safe-area-inset-bottom)` so the tab targets clear the iOS
 * home indicator without per-call boilerplate.
 */
export const mobileTabBarStyle = {
  backgroundColor: 'rgba(0, 0, 0, 0.92)',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.5)',
  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
  paddingTop: '6px',
};

export const columnInfo = {
  'Open': 'Tasks awaiting someone to claim them',
  'In Progress': 'Tasks currently being worked on',
  'Review': 'Tasks awaiting review by team members',
  'Completed': 'Tasks that have been completed and rewards issued'
};

export const emptyStateMessages = {
  'Open': 'Looks like a blank canvas! Create a task and start building something amazing.',
  'In Progress': 'No tasks in the works yet. Claim one from "Open" to show your skills!',
  'Review': 'Nothing to review at the moment. Good work happens before great feedback!',
  'Completed': 'The finish line is waiting for your first completed task. Keep pushing!'
};

export const emptyStateIcons = {
  'Open': '🚀',
  'In Progress': '⚙️',
  'Review': '🔍',
  'Completed': '🏆'
};
