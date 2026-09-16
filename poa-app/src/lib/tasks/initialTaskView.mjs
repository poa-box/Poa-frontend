/** Initial hard-navigation selection, shared by HTML hints and the feature loader. */
export function selectInitialTaskView({ view, storedMode, isMobile = false, projectId, task } = {}) {
  if (Array.isArray(view) || Array.isArray(projectId) || Array.isArray(task)) return null;
  if (projectId === '__mine__') return null; // My Work is already in the page entry.
  // useTaskRoute normalizes a bare mobile task page to All Tasks + List,
  // even if an old project preference or explicit view says otherwise.
  if (isMobile && projectId === undefined && task === undefined) return 'list';
  const valid = (mode) => ['board', 'list', 'gantt'].includes(mode);
  let mode = valid(view) ? view : valid(storedMode) ? storedMode : isMobile ? 'list' : 'board';
  if ((isMobile && mode === 'gantt') || (projectId === '__all__' && mode === 'board')) mode = 'list';
  return mode === 'board' ? isMobile ? 'mobile' : 'desktop' : mode;
}

/** Optional environment reads fail closed: never guess multiple view downloads. */
export function readInitialTaskView(select, browser) {
  const params = new browser.URLSearchParams(browser.location.search);
  if (['view', 'projectId', 'task'].some((key) => params.getAll(key).length > 1)) return null;
  let storedMode;
  try { storedMode = browser.localStorage.getItem('poa.tasks.viewMode'); } catch {}
  return select({
    view: params.get('view') ?? undefined,
    projectId: params.get('projectId') ?? undefined,
    task: params.get('task') ?? undefined,
    storedMode,
    isMobile: browser.matchMedia('(max-width: 47.99em)').matches,
  });
}
