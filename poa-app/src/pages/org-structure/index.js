import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const { userDAO, org, ...rest } = router.query;
    const orgName = org || userDAO || '';
    const params = new URLSearchParams({ org: orgName, ...rest });
    router.replace(`/team/?${params.toString()}`);
  }, [router.isReady, router.query]);
  return null;
}
