import { useCallback, useState } from 'react';
import { useRouter } from 'next/router';

export const VIEW_MODES = ['board', 'list', 'gantt'];
const STORAGE_KEY = 'poa.tasks.viewMode';
const DEFAULT_MODE = 'board';
const MOBILE_DEFAULT = 'list';
// Same breakpoint MainLayout uses to decide mobile vs desktop.
const MOBILE_QUERY = '(max-width: 47.99em)';

const isValid = (m) => VIEW_MODES.includes(m);

const readStoredMode = () => {
  if (typeof window === 'undefined') return DEFAULT_MODE;
  // An explicit, previously-chosen view always wins.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isValid(raw)) return raw;
  } catch {}
  // No saved preference yet — pick the best default for the device. Board reads
  // best on wide screens; on phones the kanban is a cramped single-column
  // carousel, so phones default to the List.
  try {
    if (window.matchMedia && window.matchMedia(MOBILE_QUERY).matches) {
      return MOBILE_DEFAULT;
    }
  } catch {}
  return DEFAULT_MODE;
};

// URL `?view=` is the source of truth; localStorage is a fallback for direct
// navigations to /tasks without a query param. We read localStorage *inside*
// the useState initializer so the first render already returns the stored
// mode — without this, switching projects (which strips `?view=` from the
// URL) renders the Board for one tick before useEffect catches up.
export function useViewMode({ allowGantt = true, allowBoard = true } = {}) {
  const router = useRouter();
  const urlMode = router.query.view;

  const [storedMode, setStoredMode] = useState(readStoredMode);

  let rawMode = (isValid(urlMode) && urlMode) || storedMode || DEFAULT_MODE;
  if (!allowGantt && rawMode === 'gantt') rawMode = 'list';
  if (!allowBoard && rawMode === 'board') rawMode = 'list';
  const viewMode = rawMode;

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
