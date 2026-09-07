import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/components/TaskManager/TaskWorkspace'),
  {
    "title": "A Task for You",
    "description": "You've been shared a task on Poa.",
    "path": "/tasks"
  },
);
