import { Component, forwardRef, lazy, useState } from 'react';
import { Box, Button, Text } from '@chakra-ui/react';
import CommunityLoadingState from '@/components/shared/CommunityLoadingState';
import { readInitialTaskView, selectInitialTaskView } from '@/lib/tasks/initialTaskView.mjs';

class TaskViewErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box h="100%" minH={0} overflowY="auto" p={6} textAlign="center" role="alert">
        <Text mb={3}>This task view could not load.</Text>
        <Button onClick={this.props.onRetry}>Try again</Button>
      </Box>
    );
  }
}

function createTaskView(loader, name) {
  let pending;
  const load = () => {
    if (!pending) {
      pending = loader().catch((error) => { pending = null; throw error; });
    }
    return pending;
  };
  let sharedView = lazy(load);
  const View = forwardRef((props, ref) => {
    const [state, setState] = useState(() => ({ View: sharedView, attempt: 0 }));
    const retry = () => {
      // React.lazy caches rejections too. Both the boundary and lazy identity
      // must reset; resetting only the error UI would immediately throw again.
      sharedView = lazy(load);
      setState((previous) => ({ View: sharedView, attempt: previous.attempt + 1 }));
    };
    const SelectedView = state.View;
    return (
      <TaskViewErrorBoundary key={state.attempt} onRetry={retry}>
        <SelectedView {...props} ref={ref} />
      </TaskViewErrorBoundary>
    );
  });
  View.displayName = name;
  return { View, load };
}

// Import promises and lazy identities are shared across project/all-task views.
const mobile = createTaskView(() => import('@/components/TaskManager/TaskBoardMobile'), 'LazyTaskBoardMobile');
const desktop = createTaskView(() => import('@/components/TaskManager/TaskBoardDesktop'), 'LazyTaskBoardDesktop');
const list = createTaskView(() => import('@/components/TaskManager/views/list/ListView'), 'LazyTaskList');
const gantt = createTaskView(() => import('@/components/TaskManager/views/gantt/GanttView'), 'LazyTaskGantt');
export const TaskBoardMobile = mobile.View;
export const TaskBoardDesktop = desktop.View;
export const ListView = list.View;
export const GanttView = gantt.View;

/** Start only the view selected by the same URL/storage/device rules as the UI. */
export function preloadInitialTaskView() {
  if (typeof window === 'undefined') return;
  try {
    const view = readInitialTaskView(selectInitialTaskView, window);
    const selected = { mobile, desktop, list, gantt }[view];
    selected?.load().catch(() => {});
  } catch { /* The actual view still loads normally when mounted. */ }
}

export function TaskViewLoading() {
  return (
    <Box h="100%" minH={0} overflowY="auto">
      <CommunityLoadingState label="Opening your tasks…" />
    </Box>
  );
}
