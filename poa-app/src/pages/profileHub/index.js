import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';

export default function LegacyRedirect() {
  const router = useRouter();
  const orgName = useOrgName();
  useEffect(() => {
    if (!router.isReady) return;
    // Destructure only to strip userDAO/org from rest; orgName comes from the hook.
    const { userDAO, org, ...rest } = router.query;
    const params = new URLSearchParams({ org: orgName, ...rest });
    router.replace(`/profile/?${params.toString()}`);
  }, [router.isReady, router.query, orgName]);
  return null;
}
