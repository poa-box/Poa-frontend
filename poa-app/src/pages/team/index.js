import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/TeamPage'),
  {
    "title": "Organization Structure",
    "description": "View organization roles and governance structure.",
    "path": "/team",
    "noIndex": true
  },
);
