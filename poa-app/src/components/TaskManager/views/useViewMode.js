import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export const VIEW_MODES = ['board', 'list', 'gantt'];
const STORAGE_KEY = 'poa.tasks.viewMode';
const DEFAULT_MODE = 'board';

const isValid = (m) => VIEW_MODES.includes(m);

// URL `?view=` is the source of truth; localStorage is a fallback for direct
// navigations to /tasks without a query param. On mobile we collapse gantt
// down to list — the caller decides whether the current viewport supports
// each mode (see ViewSwitcher).
export function useViewMode({ allowGantt = true } = {}) {
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
  const viewMode = !allowGantt && rawMode === 'gantt' ? 'list' : rawMode;

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

  return { viewMode, setViewMode };
}
