import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { TaskDialogContext, TaskDialogLoading } from '@/components/TaskManager/taskDialogLoading';

function retainAfterFirstOpen(Dialog, title) {
  return function DeferredTaskDialog(props) {
    const [opened, setOpened] = useState(false);
    useEffect(() => { if (props.isOpen) setOpened(true); }, [props.isOpen]);
    if (!props.isOpen && !opened) return null;
    return (
      <TaskDialogContext.Provider value={{ isOpen: props.isOpen, onClose: props.onClose, title }}>
        <Dialog {...props} />
      </TaskDialogContext.Provider>
    );
  };
}

const AddTaskDialog = dynamic(() => import('@/components/TaskManager/AddTaskModal'), {
  ssr: false,
  loading: TaskDialogLoading,
});
const ProjectDrawer = dynamic(() => import('@/components/TaskManager/ProjectSwitcherDrawer'), {
  ssr: false,
  loading: TaskDialogLoading,
});
const ExampleDialog = dynamic(() => import('@/components/TaskManager/ExampleTaskModal'), {
  ssr: false,
  loading: TaskDialogLoading,
});

// Retaining the mounted instance preserves the existing form/draft and drawer
// search lifecycle on close/reopen; only the unused initial mount is skipped.
export const AddTaskModal = retainAfterFirstOpen(AddTaskDialog, 'New task');
export const ProjectSwitcherDrawer = retainAfterFirstOpen(ProjectDrawer, 'Project switcher');
export const ExampleTaskModal = retainAfterFirstOpen(ExampleDialog, 'Example task');
