import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePOContext } from '@/context/POContext';

const STORAGE_PREFIX = 'poa:taskDrafts:';
const KEEP_FIELDS_KEY = 'poa:taskDrafts:keepFields';
// Same-tab cross-instance sync: the browser's `storage` event does not fire
// in the tab that called setItem, so multiple useTaskDrafts() consumers in
// the same tab (NavBar chip + TaskColumn panel) won't see each other's
// writes without an explicit notification.
const SAME_TAB_EVENT = 'poa:taskDrafts:changed';

let instanceCounter = 0;

function getStorageKey(orgId) {
  return `${STORAGE_PREFIX}${orgId}`;
}

function loadDrafts(orgId) {
  if (!orgId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDrafts(orgId, drafts) {
  if (!orgId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStorageKey(orgId), JSON.stringify(drafts));
  } catch {}
}

function makeDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useTaskDrafts() {
  const { orgId } = usePOContext();
  const [drafts, setDrafts] = useState(() => loadDrafts(orgId));

  // Per-instance ID so we can ignore our own same-tab events.
  const instanceIdRef = useRef(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = ++instanceCounter;
  }

  // Reload when org changes (or initial mount once orgId resolves)
  useEffect(() => {
    setDrafts(loadDrafts(orgId));
  }, [orgId]);

  // Cross-tab sync (browser-fired; does NOT fire in the originating tab)
  useEffect(() => {
    if (typeof window === 'undefined' || !orgId) return undefined;
    const key = getStorageKey(orgId);
    const handler = (e) => {
      if (e.key !== key) return;
      setDrafts(loadDrafts(orgId));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [orgId]);

  // Same-tab cross-instance sync (we dispatch this ourselves from persist).
  // Skip our own dispatch via instance-id check — otherwise the originator
  // would do an unnecessary extra render with a fresh array reference.
  useEffect(() => {
    if (typeof window === 'undefined' || !orgId) return undefined;
    const handler = (e) => {
      if (e.detail?.orgId !== orgId) return;
      if (e.detail?.sourceInstanceId === instanceIdRef.current) return;
      setDrafts(e.detail.drafts);
    };
    window.addEventListener(SAME_TAB_EVENT, handler);
    return () => window.removeEventListener(SAME_TAB_EVENT, handler);
  }, [orgId]);

  // Functional updater. Reads the latest state inside setDrafts so concurrent
  // callers don't trample each other via stale closures.
  const persist = useCallback(
    (updater) => {
      setDrafts((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        saveDrafts(orgId, next);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(SAME_TAB_EVENT, {
              detail: {
                orgId,
                drafts: next,
                sourceInstanceId: instanceIdRef.current,
              },
            })
          );
        }
        return next;
      });
    },
    [orgId]
  );

  const addDraft = useCallback(
    (taskData, projectId) => {
      if (!projectId) return null;
      const draft = {
        draftId: makeDraftId(),
        projectId,
        createdAt: Date.now(),
        ...taskData,
      };
      persist((prev) => [...prev, draft]);
      return draft;
    },
    [persist]
  );

  const updateDraft = useCallback(
    (draftId, patch) => {
      persist((prev) =>
        prev.map((d) => (d.draftId === draftId ? { ...d, ...patch } : d))
      );
    },
    [persist]
  );

  const replaceDraft = useCallback(
    (draftId, taskData) => {
      persist((prev) =>
        prev.map((d) =>
          d.draftId === draftId
            ? {
                draftId: d.draftId,
                projectId: d.projectId,
                createdAt: d.createdAt,
                ...taskData,
              }
            : d
        )
      );
    },
    [persist]
  );

  const getDraft = useCallback(
    (draftId) => drafts.find((d) => d.draftId === draftId) || null,
    [drafts]
  );

  const removeDraft = useCallback(
    (draftId) => {
      persist((prev) => prev.filter((d) => d.draftId !== draftId));
    },
    [persist]
  );

  const clearProjectDrafts = useCallback(
    (projectId) => {
      persist((prev) => prev.filter((d) => d.projectId !== projectId));
    },
    [persist]
  );

  const draftsForProject = useCallback(
    (projectId) => drafts.filter((d) => d.projectId === projectId),
    [drafts]
  );

  const draftsByProject = useMemo(() => {
    const grouped = new Map();
    drafts.forEach((d) => {
      if (!grouped.has(d.projectId)) grouped.set(d.projectId, []);
      grouped.get(d.projectId).push(d);
    });
    return grouped;
  }, [drafts]);

  const projectsWithDrafts = draftsByProject.size;

  return {
    orgId,
    drafts,
    draftsForProject,
    draftsByProject,
    count: drafts.length,
    projectsWithDrafts,
    addDraft,
    updateDraft,
    replaceDraft,
    getDraft,
    removeDraft,
    clearProjectDrafts,
  };
}

export function useKeepFieldsPref() {
  const [keepFields, setKeepFieldsState] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(KEEP_FIELDS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const setKeepFields = useCallback((next) => {
    setKeepFieldsState(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(KEEP_FIELDS_KEY, next ? '1' : '0');
    } catch {}
  }, []);

  return [keepFields, setKeepFields];
}

export default useTaskDrafts;
