import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';

LegacyRedirect.seo = {
  title: 'Organization learning | Poa',
  description: 'Continue to your organization’s learning page.',
  path: '/learn',
  noIndex: true,
};

export default function LegacyRedirect() {
  const router = useRouter();
  const orgName = useOrgName();
  useEffect(() => {
    if (!router.isReady) return;
    const { userDAO, org, ...rest } = router.query;
    const params = new URLSearchParams({ org: orgName, ...rest });
    router.replace(`/learn/?${params.toString()}`);
  }, [router.isReady, router.query, orgName]);
  return null;
}
