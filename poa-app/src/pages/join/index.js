import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/components/join/JoinPage'),
  {
    "title": "Join Organization",
    "description": "Join a community-owned organization.",
    "path": "/join",
    "noIndex": true
  },
);
