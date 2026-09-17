import { useEffect } from 'react';
import { useRouter } from 'next/router';

LegacyRedirect.seo = {
  title: 'Explore organizations | Poa',
  description: 'Continue to the Poa organization directory.',
  path: '/explore',
  noIndex: true,
};

export default function LegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    const params = new URLSearchParams(router.query);
    router.replace(`/explore/?${params.toString()}`);
  }, [router.isReady, router.query]);
  return null;
}
