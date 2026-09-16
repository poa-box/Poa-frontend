import { expect, it, vi } from 'vitest';

const { createPimlicoClient, getBundlerUrl } = vi.hoisted(() => ({
  createPimlicoClient: vi.fn(() => ({ getUserOperationGasPrice: async () => ({ standard: { maxFeePerGas: 5n } }) })),
  getBundlerUrl: vi.fn((chainId) => `https://bundler.example/${chainId}`),
}));
vi.mock('permissionless/clients/pimlico', () => ({ createPimlicoClient }));
vi.mock('@/config/passkey', () => ({ getBundlerUrl, ENTRY_POINT_ADDRESS: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' }));

import { createLazyPimlicoClient } from './lazyPimlicoClient';

it('defers SDK construction and bundler configuration until use, retaining chain and EntryPoint', async () => {
  const chain = { id: 100, name: 'Org chain' };
  const client = createLazyPimlicoClient(chain);
  expect(createPimlicoClient).not.toHaveBeenCalled();
  expect(getBundlerUrl).not.toHaveBeenCalled();
  expect(await client.getUserOperationGasPrice()).toEqual({ standard: { maxFeePerGas: 5n } });
  expect(createPimlicoClient).toHaveBeenCalledWith({
    chain,
    transport: expect.any(Function),
    entryPoint: { address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', version: '0.7' },
  });
  expect(getBundlerUrl).toHaveBeenCalledWith(chain.id);
  await client.getUserOperationGasPrice();
  expect(createPimlicoClient).toHaveBeenCalledTimes(1);
});
