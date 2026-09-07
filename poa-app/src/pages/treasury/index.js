import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/TreasuryPage'),
  {
    "title": "Treasury",
    "description": "Organization treasury and finances.",
    "path": "/treasury",
    "noIndex": true
  },
);
