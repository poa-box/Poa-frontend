import { http } from 'viem';
import { getBundlerUrl, ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { createLazyBundler } from '@/lib/wallet/lazyBundler';

/** A stable, usable client whose SDK is loaded on its first async operation. */
export function createLazyPimlicoClient(chain) {
  return createLazyBundler(async () => {
    const { createPimlicoClient } = await import('permissionless/clients/pimlico');
    return createPimlicoClient({
      chain,
      transport: http(getBundlerUrl(chain.id)),
      entryPoint: { address: ENTRY_POINT_ADDRESS, version: '0.7' },
    });
  });
}
