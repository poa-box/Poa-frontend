import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/AccountPage'),
  {
    "title": "Account Settings",
    "description": "Manage your Poa account settings and profile.",
    "path": "/account",
    "noIndex": true
  },
);
