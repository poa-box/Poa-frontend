import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/components/profileHub/ProfileHub'),
  {
    "title": "Profile",
    "description": "Your community profile and activity.",
    "path": "/profile",
    "noIndex": true
  },
);
