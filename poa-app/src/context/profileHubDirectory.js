import { fetchSupportedOrganizations } from '@/util/orgDirectory';
import { fetchOrgTaskCounts } from '@/util/orgTaskCounts';
import { isHiddenOrg } from '@/util/hiddenOrgs';
import { readOrganizationTotals } from '@/util/organizationTotals';

export function profileHubOrganization(org, taskCounts, memberTotals = {}) {
  const network = org._network;
  return {
    id: org.name || org.id, orgId: org.id, logoHash: org.metadataHash, logoCid: org.metadata?.logo || null,
    // Historical users and accepted memberships do not count distinct current people.
    totalMembers: memberTotals[`${network.chainId}:${org.id}`]?.totals?.members ?? null,
    taskCounts: org.taskManager?.id ? taskCounts[`${network.chainId}:${org.taskManager.id}`] ?? null : null,
    aboutInfo: org.metadata || null, deployedAt: org.deployedAt, quickJoinContract: org.quickJoin?.id,
    participationToken: org.participationToken, chainId: network.chainId, networkName: network.name,
  };
}

// Keep each endpoint's original core snapshot: copying its array loses provenance.
export async function loadProfileHubDirectory(networks, { previous = [], isCurrent = () => true, onDirectory, onCounts, onMemberTotals, force = false }) {
  const sources = await Promise.all(networks.map(async network => {
    try {
      const directory = await fetchSupportedOrganizations(network.subgraphUrl, { chainId: network.chainId });
      return { network, snapshot: directory.snapshot, organizations: directory.map(org => ({ ...org, _network: network })), available: true };
    } catch {
      return { network, organizations: previous.filter(org => org._network.chainId === network.chainId), available: false };
    }
  }));
  if (!isCurrent()) return;
  onDirectory(sources.flatMap(source => source.organizations).sort((a, b) => Number(a.deployedAt || 0) - Number(b.deployedAt || 0)),
    sources.filter(source => !source.available).map(source => source.network.chainId));
  await Promise.all(sources.map(async ({ network, snapshot, organizations, available }) => {
    const managers = [...new Set(organizations.filter(org => !isHiddenOrg(org.name || org.id)).map(org => org.taskManager?.id).filter(Boolean))];
    let counts = Object.fromEntries(managers.map(id => [id, null]));
    if (available && snapshot) {
      try {
        counts = await fetchOrgTaskCounts(network.subgraphUrl, managers, fetch, { chainId: network.chainId, directory: snapshot });
      } catch { /* Unknown counts remain unknown, including incomplete enumerations. */ }
    }
    if (isCurrent()) onCounts(Object.fromEntries(managers.map(id => [`${network.chainId}:${id}`, counts[id] ?? null])));
    if (!available || !onMemberTotals) return;
    // Bound endpoint fan-out; no RPC or render/keystroke scans.
    const visible = organizations.filter(org => !isHiddenOrg(org.name || org.id));
    for (let offset = 0; offset < visible.length && isCurrent(); offset += 4) {
      await Promise.all(visible.slice(offset, offset + 4).map(async org => {
        let result = null;
        try {
          result = await readOrganizationTotals({ source: { chainId: network.chainId, endpoint: network.subgraphUrl,
            orgId: org.id, indexed: true, snapshot: 'latest', method: 'graph:organization-totals' },
            authority: org.membershipAuthority?.id, kinds: ['members'], force });
        } catch { /* An unavailable total is not zero. */ }
        if (isCurrent()) onMemberTotals({ [`${network.chainId}:${org.id}`]: result });
      }));
    }
  }));
}
