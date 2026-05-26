import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export const VIEW_MODES = ['board', 'list', 'gantt'];
const STORAGE_KEY = 'poa.tasks.viewMode';
const DEFAULT_MODE = 'board';

const isValid = (m) => VIEW_MODES.includes(m);

const TaskViewModeContext = createContext(null);

// View mode lives ABOVE TaskBoardProvider (which is keyed on selectedProject.id
// and therefore unmounts/remounts on every project switch). Without this
// hoisting, viewMode resets to DEFAULT_MODE on every nav and the localStorage
// effect snaps it back a frame later — that's the board→list flash.
export function TaskViewModeProvider({ children }) {
  const router = useRouter();
  const urlMode = router.query.view;

  const [storedMode, setStoredMode] = useState(DEFAULT_MODE);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw && isValid(raw)) setStoredMode(raw);
    } catch {}
  }, []);

  const rawMode = (isValid(urlMode) && urlMode) || storedMode || DEFAULT_MODE;

  const setViewMode = useCallback(
    (next) => {
      if (!isValid(next)) return;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, next);
        }
      } catch {}
      setStoredMode(next);
      const nextQuery = { ...router.query, view: next };
      router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
        shallow: true,
      });
    },
    [router],
  );

  return (
    <TaskViewModeContext.Provider value={{ rawMode, setViewMode }}>
      {children}
    </TaskViewModeContext.Provider>
  );
}

// URL `?view=` is the source of truth; localStorage is a fallback for direct
// navigations to /tasks without a query param. On mobile we collapse gantt
// down to list — the caller decides whether the current viewport supports
// each mode (see ViewSwitcher).
export function useViewMode({ allowGantt = true } = {}) {
  const ctx = useContext(TaskViewModeContext);
  if (!ctx) {
    // Defensive: callers outside the provider get a no-op so we don't crash.
    // In practice every consumer is rendered inside <TaskViewModeProvider>.
    return { viewMode: DEFAULT_MODE, setViewMode: () => {} };
  }
  const viewMode = !allowGantt && ctx.rawMode === 'gantt' ? 'list' : ctx.rawMode;
  return { viewMode, setViewMode: ctx.setViewMode };
}
