import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/LeaderboardPage'),
  {
    "title": "Leaderboard",
    "description": "Organization contribution leaderboard.",
    "path": "/leaderboard",
    "noIndex": true
  },
);
