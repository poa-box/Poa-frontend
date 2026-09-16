import { DataBaseProvider } from '@/context/dataBaseContext';
import { IdentityProvider } from '@/context/IdentityContext';
import { useRouter } from 'next/router';
import { useTreasuryReadQueries } from '@/hooks/useTreasuryReadQueries';
import { POProvider, usePOContext } from '@/context/POContext';
import { ProjectProvider } from '@/context/ProjectContext';
import AccountReadWarmup from '@/components/providers/AccountReadWarmup';

function RouteReadWarmup({ enabled }) {
  const router = useRouter();
  const { orgId, subgraphUrl } = usePOContext();
  useTreasuryReadQueries({ orgId, subgraphUrl, enabled: enabled && router.pathname === '/treasury' });
  return null;
}

/**
 * Stable public data ownership across account startup and application navigation.
 * The shared registry lives above this tree. Disabling PO resolution also skips
 * dependent project queries on landing and protocol pages.
 */
export default function OrganizationReadProviders({ children, enabled }) {
  return (
    <IdentityProvider>
      <POProvider enabled={enabled}>
        <ProjectProvider>
          <RouteReadWarmup enabled={enabled} />
          <AccountReadWarmup enabled={enabled} />
          <DataBaseProvider>{children}</DataBaseProvider>
        </ProjectProvider>
      </POProvider>
    </IdentityProvider>
  );
}
