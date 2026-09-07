import deferredApplicationPage from '@/components/providers/deferredApplicationPage';

export default deferredApplicationPage(
  () => import('@/features/application/pages/ClaimPage'),
  {
    "title": "Claim a role by email",
    "description": "Claim a role in your organization by proving control of an allowlisted email.",
    "path": "/claim",
    "noIndex": true
  },
);
