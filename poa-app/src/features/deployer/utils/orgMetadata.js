import { buildOrgDeployMetadata, serializeOrgMetadata } from '@poa-box/core/metadata/org';

export { serializeOrgMetadata };

/**
 * The org-metadata JSON that gets pinned to IPFS and referenced by the org's
 * `metadataHash` on chain.
 *
 * There is exactly ONE definition of this object on purpose. It used to be built
 * twice — once by the Identity step (to get a CID early) and once by the deploy
 * page — and the two drifted: the Identity copy omitted `hideTreasury` and
 * `useTokenSymbol`, the deploy copy wrote `template: 'default'` because it read
 * `organization.template`, which nothing ever sets. Since the deploy page skips its
 * own upload when a CID already exists, the Identity copy always won and those
 * settings were silently dropped from every org that walked the normal wizard.
 *
 * Keys here must match what POContext reads back (see POContext's `org.metadata?.*`).
 */

/**
 * @param {Object} state - full deployer state
 * @returns {Object} the metadata object to pin
 */
export function buildOrgMetadata(state) {
  const organization = state?.organization || {};
  const features = state?.features || {};
  return buildOrgDeployMetadata({
    description: organization.description || '',
    links: organization.links || [],
    template: state?.ui?.selectedTemplate || organization.template || 'default',
    logoCid: organization.logoURL || null,
    backgroundColor: organization.backgroundColor || null,
    hideTreasury: features.hideTreasury === true,
    useTokenSymbol: organization.useTokenSymbol === true,
    ...(organization.taskPayoutHoursOnly === undefined ? {} : { taskPayoutHoursOnly: organization.taskPayoutHoursOnly }),
    ...(organization.taskPayoutHourlyRate === undefined ? {} : { taskPayoutHourlyRate: organization.taskPayoutHourlyRate }),
    ...(organization.zkEmailAllowlist === undefined ? {} : { zkEmailAllowlist: organization.zkEmailAllowlist }),
    extensions: organization.metadataExtensions,
  });
}

export default buildOrgMetadata;
