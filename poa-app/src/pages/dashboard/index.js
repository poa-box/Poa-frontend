import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/DashboardPage'),
  {
    "title": "Dashboard",
    "description": "Your organization dashboard.",
    "path": "/dashboard",
    "noIndex": true
  },
);
