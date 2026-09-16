import { useLayoutEffect } from 'react';
import { useEthersSigner } from '@/components/ProviderConverter';

export default function WalletSignerRuntime({ identity, publish }) {
  const signer = useEthersSigner();
  useLayoutEffect(() => {
    publish({ identity, signer });
    return () => publish(null);
  }, [identity, signer, publish]);
  return null;
}
