import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/VotesPage'),
  {
    "title": "Vote archive",
    "description": "View past votes and proposals.",
    "path": "/votes",
    "noIndex": true
  },
);
