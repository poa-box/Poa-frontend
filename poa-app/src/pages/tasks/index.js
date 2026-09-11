import Page from '@/components/TaskManager/TaskWorkspace';

// Keep metadata available above the application providers during initial load.
Page.seo = {
  noIndex: true,
    "title": "A Task for You",
    "description": "You've been shared a task on Poa.",
    "path": "/tasks"
  };

export default Page;
