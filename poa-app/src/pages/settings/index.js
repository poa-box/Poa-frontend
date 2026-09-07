import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/SettingsPage'),
  {
    "title": "Settings",
    "description": "Organization settings and configuration.",
    "path": "/settings",
    "noIndex": true
  },
);
