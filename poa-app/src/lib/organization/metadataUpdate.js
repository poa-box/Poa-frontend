import { gql } from '@apollo/client';
import { FETCH_ORG_BY_ID } from '@poa-box/core/graph/documents/org';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@poa-box/core/graph/documents/infrastructure';
import { mergeOrgMetadata, requireRawOrgMetadata, serializeOrgMetadata, validateOrgMetadataUpdates } from '@poa-box/core/metadata/org';
import { metadataPointerToBytes32, bytes32ToCidV0 } from '@poa-box/core/encoding/cid';
import { buildUpdateOrgMetaAsAdmin } from '@poa-box/core/tx/org';

export const ORG_METADATA_QUERY = gql(FETCH_ORG_BY_ID);
export const ORG_INFRASTRUCTURE_QUERY = gql(FETCH_INFRASTRUCTURE_ADDRESSES);

/** Fresh action-time read. Unknown/unreadable is never an empty merge base. */
export async function readOrganizationMetadata({ client, orgId, fetchMetadata, assertCurrent = () => {} }) {
  assertCurrent();
  const { data, errors } = await client.query({
    query: ORG_METADATA_QUERY, variables: { id: orgId }, fetchPolicy: 'network-only',
  });
  assertCurrent();
  const organization = data?.organization;
  if (errors?.length || !organization || organization.id?.toLowerCase() !== orgId?.toLowerCase()
    || !Object.prototype.hasOwnProperty.call(organization, 'metadataHash')
    || (organization.metadataHash !== null && typeof organization.metadataHash !== 'string')) {
    throw new Error('Could not read the organization’s current details. Please try again.');
  }
  const pointer = organization.metadataHash;
  let metadata = {};
  if (pointer !== null && pointer !== '' && !/^0x0+$/i.test(pointer)) {
    try {
      const cid = bytes32ToCidV0(metadataPointerToBytes32(pointer));
      metadata = requireRawOrgMetadata(await fetchMetadata(cid));
    } catch {
      throw new Error('Could not read the organization’s saved details. Please try again.');
    }
    assertCurrent();
  }
  return { organization, metadata };
}

/** Host content transport and scope; core owns merge, serialization and registry calldata. */
export async function prepareOrganizationMetadataUpdate({
  client, orgId, orgRegistryAddress, name, updates, fetchMetadata, uploadMetadata,
  assertCurrent = () => {},
}) {
  validateOrgMetadataUpdates(updates);
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    throw new Error('Organization name is required.');
  }
  const current = await readOrganizationMetadata({ client, orgId, fetchMetadata, assertCurrent });
  const nextName = name === undefined ? current.organization.name : name.trim();
  if (typeof nextName !== 'string' || !nextName.trim()) {
    throw new Error('Could not read the organization’s current name. Please try again.');
  }
  const metadata = mergeOrgMetadata(current.metadata, updates);
  const json = serializeOrgMetadata(metadata);
  assertCurrent();
  const result = await uploadMetadata(json);
  assertCurrent();
  if (!result?.path) throw new Error('Could not save the organization’s details. Please try again.');
  return {
    metadata, cid: result.path,
    intent: buildUpdateOrgMetaAsAdmin({
      orgRegistryAddress, orgId, name: nextName, metadataHash: metadataPointerToBytes32(result.path),
    }),
  };
}
