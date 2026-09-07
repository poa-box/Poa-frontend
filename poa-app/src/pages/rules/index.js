import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/RulesPage'),
  {
    "title": "Our rules",
    "description": "How this group decides — and what it takes to change it.",
    "path": "/rules",
    "noIndex": true
  },
);
