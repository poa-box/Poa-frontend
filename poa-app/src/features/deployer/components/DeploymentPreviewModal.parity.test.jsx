import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';
import { buildOrgMetadata } from '@/features/deployer/utils/orgMetadata';
vi.mock('@chakra-ui/react', async () => (await import('@/test/parityHost')).parityChakra());
import DeploymentPreviewModal from '@/features/deployer/components/DeploymentPreviewModal';
let host;
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); host = createParityHost(); });
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('mounted final deployment confirmation Shares modes', () => {
  it.each([[undefined, 'MiXeD', 'Shares'], [false, 'MiXeD', 'Shares'], [true, 'MiXeD', 'MiXeD'], [true, '', 'Shares'], [true, undefined, 'Shares']])(
    'uses flag %s and symbol %s in the exact prepared confirmation', async (useTokenSymbol, tokenSymbol, label) => {
      const metadata = buildOrgMetadata({ organization: { name: 'Together', description: 'Shared work', links: [], useTokenSymbol, tokenSymbol }, features: {}, roles: [] });
      const onConfirm = vi.fn(), onCancel = vi.fn();
      await host.render(<DeploymentPreviewModal data={{ orgName: 'Together', metadata,
        params: { tokenSymbol, roles: [], hybridClasses: [{ strategy: 1, slicePct: 100 }] }, predicted: {} }} onConfirm={onConfirm} onCancel={onCancel} />);
      expect(host.container.textContent).toContain(`Voting power follows ${label}`);
      expect(host.button('Create Together')).toBeDefined();
      await host.click(host.button('Not yet')); expect(onCancel).toHaveBeenCalledOnce(); expect(onConfirm).not.toHaveBeenCalled();
    });
});
