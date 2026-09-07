import { fetchOrgByName } from '@/util/orgLookup';
import { getClient } from '@/util/apolloClient';
import { CAPABILITY, peekCapability, recordConfirmedCapability } from '@/util/subgraphCapabilities';

import { getOrganizationSnapshot } from '@/util/orgSnapshotPlan';
export { getOrganizationSnapshot, INITIAL_VOTING_VARIABLES } from '@/util/orgSnapshotPlan';

/** One request discovers the organization AND supplies its initial public data. */
export async function fetchOrganizationSnapshot(source, name, { signal, treasury = false } = {}) {
  // A successful document validates these fields even if its organization list
  // is empty. Older schemas fall back as a unit before any data is published.
  const releases = peekCapability(source.url, CAPABILITY.TASK_RELEASES) !== false;
  const proposer = peekCapability(source.url, CAPABILITY.PROPOSAL_PROPOSER) !== false;
  const attempts = [getOrganizationSnapshot({ releases, proposer, treasury })];
  if (releases || proposer) attempts.push(getOrganizationSnapshot({ treasury }));

  for (let index = 0; index < attempts.length; index++) {
    const plan = attempts[index];
    try {
      const org = await fetchOrgByName(source, name, { signal, query: plan.query, variables: plan.variables });
      if (index === 0) {
        if (releases) recordConfirmedCapability(source.url, CAPABILITY.TASK_RELEASES);
        if (proposer) recordConfirmedCapability(source.url, CAPABILITY.PROPOSAL_PROPOSER);
      }
      return org ? { id: org.id, name: org.name, snapshot: plan.entries(org) } : null;
    } catch (error) {
      // Transport failure is not schema evidence. Preserve lookup retry and
      // cancellation semantics instead of multiplying requests on an outage.
      if (error.name !== 'GraphQLResponseError' || !error.isSchemaError) throw error;
    }
  }
  // A domain field unavailable on an older endpoint must not make the org
  // disappear. Existing independent queries retain their error isolation.
  return fetchOrgByName(source, name, { signal });
}

/** Only the verified winning endpoint is seeded, before its orgId is exposed. */
export function seedOrganizationSnapshot(endpoint, org) {
  if (!org.snapshot?.length) return false;
  const client = getClient(endpoint);
  client.cache.batch({
    update(cache) {
      for (const entry of org.snapshot) cache.writeQuery(entry);
    },
  });
  return true;
}
