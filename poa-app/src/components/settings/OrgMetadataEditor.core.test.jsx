import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { bytes32ToCidV0 } from '@poa-box/core/encoding/cid';
import OrgMetadataEditor from '@/components/settings/OrgMetadataEditor';
import EmailAllowlistEditor from '@/components/settings/EmailAllowlistEditor';

const fixture = vi.hoisted(() => ({ actions: [], client: null, fetchMetadata: null, upload: null, execute: null, writable: null }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra(fixture.actions));
vi.mock('@chakra-ui/icons', () => ({ CloseIcon: () => null, AddIcon: () => null }));
vi.mock('react-dropzone', () => ({ useDropzone: () => ({ getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false }) }));
vi.mock('@apollo/client', async importOriginal => ({
  ...await importOriginal(), useQuery: () => ({ data: { poaManagerContracts: [{ orgRegistryProxy: '0x1111111111111111111111111111111111111111' }] } }),
}));
vi.mock('@/util/apolloClient', () => ({ getClient: () => fixture.client }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ addToIpfs: fixture.upload, safeFetchFromIpfs: fixture.fetchMetadata }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ isPasskeyUser: true, accountAddress: '0x2222222222222222222222222222222222222222' }) }));
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({ chain: { id: 100 } }), useSwitchChain: () => ({ switchChainAsync: vi.fn() }) }));
vi.mock('@/hooks/useWeb3Services', () => ({
  useWeb3Services: () => ({ factory: { createWritable: fixture.writable }, txManager: { execute: fixture.execute }, isReady: true }),
  useTransactionWithNotification: () => ({ executeWithNotification: fn => fn() }),
}));
vi.mock('@/hooks/useTransactionWithNotification', () => ({ useTransactionWithNotification: () => ({ executeWithNotification: fn => fn() }) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: { METADATA_UPDATED: 'metadata-updated' } }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ roleHatIds: [], roleNames: {}, zkEmailInvitesAddress: null }) }));
vi.mock('@/hooks/useOrgStructure', () => ({ useOrgStructure: () => ({ roles: [] }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const orgId = ethers.utils.id('metadata-editor-fixture');
beforeEach(() => {
  fixture.actions.length = 0;
  fixture.client = { query: vi.fn(async () => ({ data: { organization: { id: orgId, name: 'Café', metadataHash: ethers.utils.id('current') } } })) };
  fixture.fetchMetadata = vi.fn(async () => ({ template: 'cooperative', logo: 'retained-logo', future: { flag: false }, zkEmailAllowlist: { cid: 'retained-invites' } }));
  fixture.upload = vi.fn(async () => ({ path: bytes32ToCidV0(ethers.utils.id('new-content')) }));
  fixture.execute = vi.fn(async () => ({ success: true }));
  fixture.writable = vi.fn(() => ({ marker: 'host-contract' }));
});

function render(flag, symbol = 'MiXeD') {
  return renderToStaticMarkup(<OrgMetadataEditor orgId={orgId} orgChainId={100} currentName="Café"
    currentDescription="Changed description" currentLinks={[]} currentLogoHash="retained-logo"
    currentHideTreasury={false} currentUseTokenSymbol={flag} currentTokenSymbol={symbol}
    currentTaskPayoutHoursOnly={true} currentTaskPayoutHourlyRate={12.5} />);
}

const save = () => fixture.actions.find(action => action.children === 'Save Changes');

describe('settings editor core adapter integration', () => {
  it.each([[undefined, 'MiXeD', 'Shares'], [false, 'MiXeD', 'Shares'], [true, 'MiXeD', 'MiXeD'], [true, '', 'Shares']])(
    'shows and saves the configured reward label (%s, %s)', async (flag, symbol, label) => {
      expect(render(flag, symbol)).toContain(`${label} per hour`);
      expect(save()).toBeDefined();
      await save().onClick();
      const metadata = JSON.parse(fixture.upload.mock.calls[0][0]);
      expect(metadata).toMatchObject({ template: 'cooperative', logo: 'retained-logo', future: { flag: false },
        zkEmailAllowlist: { cid: 'retained-invites' }, useTokenSymbol: flag === true, taskPayoutHoursOnly: true, taskPayoutHourlyRate: 12.5 });
      expect(fixture.execute).toHaveBeenCalledWith({ marker: 'host-contract' }, 'updateOrgMetaAsAdmin', [
        orgId, ethers.utils.toUtf8Bytes('Café'), ethers.utils.id('new-content'),
      ], { value: '0' });
    },
  );

  it('refuses an unreadable metadata base before the editor uploads or sends', async () => {
    fixture.fetchMetadata.mockResolvedValue(null);
    render(false);
    await save().onClick();
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it('does not present unresolved invitation reads as an empty editable list', () => {
    const html = renderToStaticMarkup(<EmailAllowlistEditor orgId={orgId} orgChainId={100} currentName="Café" />);
    expect(html).toContain('Checking invitation status');
    expect(html).toContain('Loading the current invite list');
    const action = fixture.actions.find(item => item.children === 'Save the list');
    expect(action.isDisabled).toBe(true);
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.execute).not.toHaveBeenCalled();
  });
});
