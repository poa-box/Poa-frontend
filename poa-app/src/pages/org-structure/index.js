import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';

LegacyRedirect.seo = {
  title: 'Organization members | Poa',
  description: 'Continue to your organization’s members page.',
  path: '/team',
  noIndex: true,
};

export default function LegacyRedirect() {
  const router = useRouter();
  const orgName = useOrgName();
  useEffect(() => {
    if (!router.isReady) return;
    const { userDAO, org, ...rest } = router.query;
    const params = new URLSearchParams({ org: orgName, ...rest });
    router.replace(`/team/?${params.toString()}`);
  }, [router.isReady, router.query, orgName]);
  return null;
}
