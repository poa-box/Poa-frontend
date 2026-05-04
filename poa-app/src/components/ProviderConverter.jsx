import { providers, Wallet } from 'ethers';
import { useMemo } from 'react';
import { useClient } from 'wagmi';
import { useConnectorClient } from 'wagmi';
import { E2E_ENABLED, E2E_BURNER_PK } from '@/services/e2e/e2eMode';



export function clientToProvider(client) {
  if (!client) return undefined;

  const { chain, transport } = client;
  if (!chain || !transport) return undefined;

  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };

  if (transport.type === 'fallback') {
    return new providers.FallbackProvider(
      transport.transports.map(
        ({ value }) => new providers.JsonRpcProvider(value?.url, network),
      ),
    );
  }
  return new providers.JsonRpcProvider(transport.url, network);
}

/** Hook to convert a viem Client to an ethers.js Provider. */
export function useEthersProvider({ chainId } = {}) {
  const client = useClient({ chainId });
  return useMemo(() => (client ? clientToProvider(client) : undefined), [client]);
}


export function clientToSigner(client) {
    if (!client) return undefined;

    const { account, chain, transport } = client;
    if (!account || !chain || !transport) return undefined;

    const network = {
      chainId: chain.id,
      name: chain.name,
      ensAddress: chain.contracts?.ensRegistry?.address,
    };

    // Create a provider using Web3Provider and the transport network details
    const provider = new providers.Web3Provider(transport, network);

    // Return the signer instance associated with the given account
    return provider.getSigner(account.address);
  }
  
  /** Hook to convert a Viem Client to an ethers.js Signer. */
  export function useEthersSigner({ chainId } = {}) {
    // Use the wagmi `useConnectorClient` to get the client data
    const { data: client } = useConnectorClient({ chainId });
    const provider = useEthersProvider({ chainId });

    return useMemo(() => {
      if (E2E_ENABLED && E2E_BURNER_PK && provider) {
        // E2E mode: bypass the wagmi mock connector (which has no signing key)
        // and produce a real ethers.Wallet bound to the burner key.
        return new Wallet(E2E_BURNER_PK, provider);
      }
      return client ? clientToSigner(client) : undefined;
    }, [client, provider]);
  }
