import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/VotingPage'),
  {
    "title": "Voting",
    "description": "Vote on organization proposals.",
    "path": "/voting",
    "noIndex": true
  },
);
