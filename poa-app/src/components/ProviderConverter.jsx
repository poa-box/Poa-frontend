import { providers, Wallet } from 'ethers';
import { useMemo } from 'react';
import { useClient } from 'wagmi';
import { useConnectorClient } from 'wagmi';
import { E2E_BURNER_PK } from '@/services/e2e/e2eMode';



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
  
  /**
   * Hook to convert a Viem Client to an ethers.js Signer.
   *
   * In E2E mode we bypass the wagmi mock connector (no signing key) and
   * return a real ethers.Wallet bound to the burner key. The E2E variant
   * needs an additional `useEthersProvider` call, which we don't want
   * production paying for on every render — `useEthersSigner` is exported
   * as one of two implementations chosen at module-load by the build-time
   * literal environment guard. An imported flag can survive chunk splitting.
   */
  function useEthersSignerProd({ chainId } = {}) {
    const { data: client } = useConnectorClient({ chainId });
    return useMemo(() => (client ? clientToSigner(client) : undefined), [client]);
  }

  function useEthersSignerE2E({ chainId } = {}) {
    const { data: client } = useConnectorClient({ chainId });
    const provider = useEthersProvider({ chainId });
    return useMemo(() => {
      if (E2E_BURNER_PK && provider) return new Wallet(E2E_BURNER_PK, provider);
      return client ? clientToSigner(client) : undefined;
    }, [client, provider]);
  }

  export const useEthersSigner = process.env.NEXT_PUBLIC_E2E_MODE === 'true' ? useEthersSignerE2E : useEthersSignerProd;
