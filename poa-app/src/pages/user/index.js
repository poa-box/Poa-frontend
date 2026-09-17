import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';

LegacyRedirect.seo = {
  title: 'Join an organization | Poa',
  description: 'Continue to the organization membership page.',
  path: '/join',
  noIndex: true,
};

export default function LegacyRedirect() {
  const router = useRouter();
  const orgName = useOrgName();
  useEffect(() => {
    if (!router.isReady) return;
    const { userDAO, org, ...rest } = router.query;
    const params = new URLSearchParams({ org: orgName, ...rest });
    router.replace(`/join/?${params.toString()}`);
  }, [router.isReady, router.query, orgName]);
  return null;
}
