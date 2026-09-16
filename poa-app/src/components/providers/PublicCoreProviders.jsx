import { ApolloProvider } from '@apollo/client';
import Notification from '@/components/Notifications';
import WhiteLabelUrlCleaner from '@/components/WhiteLabelUrlCleaner';
import { IPFSprovider } from '@/context/ipfsContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { RefreshProvider } from '@/context/RefreshContext';
import apolloClient from '@/util/apolloClient';

/** Shared read infrastructure, independent of wallet and transaction startup. */
export default function PublicCoreProviders({ children }) {
  return (
    <ApolloProvider client={apolloClient}>
      <RefreshProvider>
        <IPFSprovider>
          <NotificationProvider>
            <WhiteLabelUrlCleaner />
            <Notification />
            {children}
          </NotificationProvider>
        </IPFSprovider>
      </RefreshProvider>
    </ApolloProvider>
  );
}
