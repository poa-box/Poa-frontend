import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { cidV0ToBytes32, bytes32ToCidV0 } from '@poa-box/core/encoding/cid';
import { resolveTokenLabel } from '@poa-box/core/metadata/org';
import OrgRegistryABI from '../../../abi/OrgRegistry.json';
import { prepareOrganizationMetadataUpdate } from '@/lib/organization/metadataUpdate';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { resolveMetadataAdminDisplay } from '@/lib/organization/adminDisplay';

const ORG = ethers.utils.id('offline-organization');
const REGISTRY = '0x1111111111111111111111111111111111111111';
const OLD_CID = bytes32ToCidV0(ethers.utils.id('old-metadata'));
const NEXT_CID = bytes32ToCidV0(ethers.utils.id('new-metadata'));
const current = {
  description: 'Existing description', template: 'worker-coop', logo: 'existing-logo',
  links: [{ name: 'Community', url: 'https://example.test', futureLink: true }],
  backgroundColor: '#abc', hideTreasury: true, useTokenSymbol: true,
  taskPayoutHoursOnly: true, taskPayoutHourlyRate: 0,
  zkEmailAllowlist: { cid: 'invite-content', root: ethers.utils.id('invites'), entryCount: 0 },
  future: { enabled: false, count: 0, nested: ['keep'] },
};

let client, fetchMetadata, uploadMetadata, params;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  client = { query: vi.fn(async () => ({ data: { organization: { id: ORG, name: 'Café together', metadataHash: cidV0ToBytes32(OLD_CID) } } })) };
  fetchMetadata = vi.fn(async () => structuredClone(current));
  uploadMetadata = vi.fn(async () => ({ path: NEXT_CID }));
  params = { client, fetchMetadata, uploadMetadata, orgId: ORG, orgRegistryAddress: REGISTRY, updates: { description: 'Updated' } };
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('organization metadata action through actual core', () => {
  it('preserves the raw document, including zero, false, invitation state and extensions', async () => {
    const prepared = await prepareOrganizationMetadataUpdate(params);
    expect(prepared.metadata).toEqual({ ...current, description: 'Updated' });
    expect(client.query).toHaveBeenCalledWith(expect.objectContaining({ variables: { id: ORG }, fetchPolicy: 'network-only' }));
    expect(fetchMetadata).toHaveBeenCalledWith(OLD_CID);
    expect(JSON.parse(uploadMetadata.mock.calls[0][0])).toEqual(prepared.metadata);

    const expectedBytes = new ethers.utils.Interface(OrgRegistryABI).encodeFunctionData('updateOrgMetaAsAdmin', [
      ORG, ethers.utils.toUtf8Bytes('Café together'), cidV0ToBytes32(NEXT_CID),
    ]);
    const actualBytes = new ethers.utils.Interface(prepared.intent.abi).encodeFunctionData(prepared.intent.method, prepared.intent.args);
    expect(actualBytes).toBe(expectedBytes);
    const receipt = { success: true, blockNumber: 123, rawReceipt: { retained: true } };
    const contract = {};
    const factory = { createWritable: vi.fn(() => contract) };
    const manager = { execute: vi.fn(async () => receipt) };
    expect(await executeCoreIntent(factory, manager, prepared.intent)).toBe(receipt);
    expect(manager.execute).toHaveBeenCalledWith(contract, 'updateOrgMetaAsAdmin', prepared.intent.args, { value: '0' });
  });

  it('supports explicit clears, false, a numeric indexed rate and stamped links', async () => {
    params.name = '  A new name  ';
    params.updates = { description: '', links: [{ name: 'New', url: 'https://new.test', extension: 0 }], logoCid: null,
      backgroundColor: '', hideTreasury: false, useTokenSymbol: false, taskPayoutHoursOnly: false, taskPayoutHourlyRate: '0' };
    const { metadata, intent } = await prepareOrganizationMetadataUpdate(params);
    expect(metadata).toMatchObject({ description: '', logo: null, backgroundColor: '', hideTreasury: false,
      useTokenSymbol: false, taskPayoutHoursOnly: false, taskPayoutHourlyRate: 0 });
    expect(metadata.links).toEqual([{ name: 'New', url: 'https://new.test', extension: 0, index: 0 }]);
    expect(ethers.utils.toUtf8String(intent.args[1])).toBe('A new name');
  });

  it('preserves edits across alternating preference and invitation saves', async () => {
    const first = await prepareOrganizationMetadataUpdate({ ...params, updates: { useTokenSymbol: false, logoCid: null } });
    fetchMetadata.mockResolvedValue(first.metadata);
    const second = await prepareOrganizationMetadataUpdate({ ...params, updates: { zkEmailAllowlist: { cid: 'next-invites', root: ethers.utils.id('next'), entryCount: 1 } } });
    expect(second.metadata).toMatchObject({ template: 'worker-coop', logo: null, useTokenSymbol: false, future: current.future });
    expect(second.metadata.zkEmailAllowlist.entryCount).toBe(1);
  });

  it.each([undefined, false, true])('keeps the exact explicit symbol preference %s', async flag => {
    params.updates = flag === undefined ? { description: 'Updated' } : { useTokenSymbol: flag };
    fetchMetadata.mockResolvedValue({ ...current, useTokenSymbol: flag });
    const { metadata } = await prepareOrganizationMetadataUpdate(params);
    expect(resolveTokenLabel({ useTokenSymbol: metadata.useTokenSymbol, symbol: 'MiXeD' })).toBe(flag === true ? 'MiXeD' : 'Shares');
    expect(resolveTokenLabel({ useTokenSymbol: metadata.useTokenSymbol, symbol: '  ' })).toBe('Shares');
  });

  it.each([null, '', ethers.constants.HashZero])('initializes only a proven empty metadata pointer %s', async pointer => {
    client.query.mockResolvedValue({ data: { organization: { id: ORG, name: 'New', metadataHash: pointer } } });
    await expect(prepareOrganizationMetadataUpdate(params)).resolves.toHaveProperty('intent');
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it.each([
    ['missing organization', { data: { organization: null } }],
    ['wrong organization', { data: { organization: { id: ethers.utils.id('other'), name: 'Other', metadataHash: null } } }],
    ['missing pointer', { data: { organization: { id: ORG, name: 'New' } } }],
    ['undefined pointer', { data: { organization: { id: ORG, name: 'New', metadataHash: undefined } } }],
    ['partial GraphQL error', { data: { organization: { id: ORG, name: 'New', metadataHash: null } }, errors: [{ message: 'partial' }] }],
  ])('refuses %s before any upload', async (_label, response) => {
    client.query.mockResolvedValue(response);
    await expect(prepareOrganizationMetadataUpdate(params)).rejects.toThrow();
    expect(uploadMetadata).not.toHaveBeenCalled();
  });

  it.each([null, [], 'failed fetch'])('refuses an unreadable raw document %s', async value => {
    fetchMetadata.mockResolvedValue(value);
    await expect(prepareOrganizationMetadataUpdate(params)).rejects.toThrow(/saved details/);
    expect(uploadMetadata).not.toHaveBeenCalled();
  });

  it('rejects stale scope after the fetch and after the pin without yielding a writable intent', async () => {
    let live = true;
    const assertCurrent = () => { if (!live) throw new Error('stale scope'); };
    fetchMetadata.mockImplementation(async () => { live = false; return current; });
    await expect(prepareOrganizationMetadataUpdate({ ...params, assertCurrent })).rejects.toThrow('stale scope');
    expect(uploadMetadata).not.toHaveBeenCalled();
    live = true;
    fetchMetadata.mockResolvedValue(current);
    uploadMetadata.mockImplementation(async () => { live = false; return { path: NEXT_CID }; });
    await expect(prepareOrganizationMetadataUpdate({ ...params, assertCurrent })).rejects.toThrow('stale scope');
  });

  it('rejects blank names and invalid preference edits before reading or pinning', async () => {
    await expect(prepareOrganizationMetadataUpdate({ ...params, name: '  ' })).rejects.toThrow(/name/);
    await expect(prepareOrganizationMetadataUpdate({ ...params, updates: { useTokenSymbol: 'false' } })).rejects.toThrow(/boolean/);
    expect(client.query).not.toHaveBeenCalled();
    expect(uploadMetadata).not.toHaveBeenCalled();
  });
});

describe('metadata admin display facts', () => {
  it('normalizes large hex IDs and handles explicit zero overrides', () => {
    const large = '9007199254740993';
    expect(resolveMetadataAdminDisplay({ metadataAdminHatId: large, topHatId: '1', userHatIds: ['0x20000000000001'] })).toBe(true);
    expect(resolveMetadataAdminDisplay({ metadataAdminHatId: '0', topHatId: large, userHatIds: ['0x20000000000001'] })).toBe(true);
    expect(resolveMetadataAdminDisplay({ metadataAdminHatId: large, topHatId: '1', userHatIds: ['1'] })).toBe(false);
  });
  it('retains unresolved evidence instead of treating missing facts as denial', () => {
    expect(resolveMetadataAdminDisplay({ topHatId: '1', userHatIds: ['1'] })).toBeNull();
    expect(resolveMetadataAdminDisplay({ metadataAdminHatId: null, topHatId: '1', userHatIds: null })).toBeNull();
  });
});
