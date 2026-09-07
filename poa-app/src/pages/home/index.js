import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/HomePage'),
  {
    "title": "Organization Home",
    "description": "Organization overview and activity.",
    "path": "/home",
    "noIndex": true
  },
);
