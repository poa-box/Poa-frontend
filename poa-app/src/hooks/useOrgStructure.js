/**
 * useOrgStructure - Hook for fetching organization structure data
 * Used by the /org-structure page to display roles, permissions, and members
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import { FETCH_ORG_STRUCTURE_DATA } from '@/util/queries';
import { useIPFScontext } from '@/context/ipfsContext';
import { usePOContext } from '@/context/POContext';
import { formatTokenAmount } from '@/util/formatToken';
import { useSubgraphClient } from '@/util/apolloClient';
import { useAuthorityEvidence } from '@/hooks/accessV2/useAuthorityEvidence';
import { enrollmentRoleFacts } from '@/hooks/enrollmentRoleFacts';
import { orgStructurePermissions } from '@/hooks/orgStructurePermissions';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';
import { isLegacyTopHatId } from '@/lib/accessV2/ids';
import { resolveLegacyRoleName } from '@/lib/roles/roleNames';

/**
 * Generate fallback role name based on index
 * @param {number} index - Role index
 * @returns {string} Fallback name
 */
function getFallbackRoleName(index) {
  return `Role ${index + 1}`;
}

/**
 * Normalize a hat ID to a string for consistent comparison.
 * Handles BigInt, numbers, hex strings, etc.
 */
function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  // Convert to string and trim any whitespace
  const str = String(id).trim();
  // If it's a hex string, normalize to lowercase
  if (str.startsWith('0x') || str.startsWith('0X')) {
    return str.toLowerCase();
  }
  return str;
}

/**
 * Transform raw role data into display format
 * @param {Array} roles - Raw roles from subgraph (already filtered by isUserRole: true)
 * @param {Array} roleHatIds - Role hat IDs in order
 * @param {Object} roleNamesFromIPFS - Role names from IPFS metadata
 * @param {Array} users - Users from subgraph to calculate member counts
 * @returns {Array} Transformed roles with names and member info
 */
function transformRolesData(roles, roleHatIds, roleNamesFromIPFS = {}, users = []) {
  if (!roles || !Array.isArray(roles)) return [];

  // Convert roleHatIds to normalized strings for comparison
  const normalizedRoleHatIds = (roleHatIds || []).map(id => normalizeHatId(id));

  // Note: Roles are already filtered by isUserRole: true in the GraphQL query
  // No need for frontend filtering

  const mapped = roles.map((role, index) => {
    const hatId = role.hatId;
    const hatIdNorm = normalizeHatId(hatId);

    // Find index in roleHatIds to determine the fallback name
    const foundIndex = normalizedRoleHatIds.findIndex(id => id === hatIdNorm);
    // Use found index if valid, otherwise use the array index
    const roleIndex = foundIndex >= 0 ? foundIndex : index;

    // Hat/IPFS metadata follows later renames. Role.name can be stale or, for a create+metadata
    // batch, contain the raw bytes32 metadata digest instead of a display name.
    const name = resolveLegacyRoleName(role, {
      ipfsName: roleNamesFromIPFS[hatIdNorm] || roleNamesFromIPFS[hatId],
      fallback: getFallbackRoleName(roleIndex),
    });

    // This historical display window supplies names, never a current member total.
    const roleWearers = role.wearers || [];

    // Get hat details
    const hat = role.hat || {};
    const level = hat.level ?? 0;
    const parentHatId = hat.parentHatId;
    const defaultEligible = null; // Historical Hats defaults cannot qualify native joining.
    // Role description from the hat's IPFS metadata (set via EligibilityModule.updateHatMetadata).
    // May be empty until the subgraph's IPFS file data source resolves.
    const description = hat.metadata?.description || '';

    return {
      id: role.id,
      hatId,
      name,
      description,
      image: role.image || '',
      canVote: null, // Current permission facts live in the qualified matrix, not historical Role rows.
      level,
      parentHatId,
      memberCount: null,
      defaultEligible,
      wearers: roleWearers.map(w => ({
        address: w.wearer,
        username: w.wearerUsername,
      })),
      vouchingEnabled: null,
      vouchingQuorum: null,
      vouchingMembershipHatId: null,
      permissions: [],
    };
  });

  // Build tree order from parentHatId relationships.
  // A role whose parentHatId matches another role's hatId is that role's child.
  const hatIdSet = new Set(mapped.map(r => normalizeHatId(r.hatId)));
  const childrenOf = new Map(); // parentHatId -> [child roles]
  const roots = [];

  for (const role of mapped) {
    const parentNorm = normalizeHatId(role.parentHatId);
    if (parentNorm && hatIdSet.has(parentNorm)) {
      const kids = childrenOf.get(parentNorm) || [];
      kids.push(role);
      childrenOf.set(parentNorm, kids);
    } else {
      roots.push(role);
    }
  }

  // DFS to produce display order and assign tree depth
  const ordered = [];
  const visited = new Set();
  function walk(role, depth) {
    const key = normalizeHatId(role.hatId);
    if (visited.has(key)) return; // cycle guard
    visited.add(key);
    ordered.push({ ...role, level: depth });
    const kids = childrenOf.get(key) || [];
    // Sort siblings by roleHatIds position for stable order
    kids.sort((a, b) => {
      const aIdx = normalizedRoleHatIds.indexOf(normalizeHatId(a.hatId));
      const bIdx = normalizedRoleHatIds.indexOf(normalizeHatId(b.hatId));
      return aIdx - bIdx;
    });
    for (const child of kids) {
      walk(child, depth + 1);
    }
  }

  // Sort roots by roleHatIds position
  roots.sort((a, b) => {
    const aIdx = normalizedRoleHatIds.indexOf(normalizeHatId(a.hatId));
    const bIdx = normalizedRoleHatIds.indexOf(normalizeHatId(b.hatId));
    return aIdx - bIdx;
  });
  for (const root of roots) {
    walk(root, 0);
  }

  return ordered;
}

/**
 * Transform users into members grouped by role
 * @param {Array} users - Users from subgraph
 * @param {Array} roles - Transformed roles
 * @returns {Object} Members grouped by role { hatId: [members] }
 */
function groupMembersByRole(users, roles) {
  if (!users || !Array.isArray(users)) return {};

  const groups = {};

  // Create a map from normalized hatId to original hatId for lookups
  const normalizedToOriginal = {};
  roles.forEach(role => {
    const normalized = normalizeHatId(role.hatId);
    normalizedToOriginal[normalized] = role.hatId;
    groups[role.hatId] = [];
  });

  // Group users by their hat IDs (using normalized comparison)
  users.forEach(user => {
    const hatIds = user.currentHatIds || [];
    hatIds.forEach(userHatId => {
      const normalizedUserHatId = normalizeHatId(userHatId);
      const originalHatId = normalizedToOriginal[normalizedUserHatId];

      if (originalHatId && groups[originalHatId]) {
        groups[originalHatId].push({
          id: user.id,
          address: user.address,
          username: user.account?.username,
          participationTokenBalance: formatTokenAmount(user.participationTokenBalance || '0'),
          membershipStatus: user.membershipStatus,
          totalTasksCompleted: parseInt(user.totalTasksCompleted, 10) || 0,
          totalVotes: parseInt(user.totalVotes, 10) || 0,
          firstSeenAt: user.firstSeenAt,
          lastActiveAt: user.lastActiveAt,
        });
      }
    });
  });

  return groups;
}

/**
 * Hook for fetching and managing org structure data
 * @returns {Object} Org structure data and utilities
 */
export function useOrgStructure() {
  const { orgId, roleHatIds, topHatId, subgraphUrl, tokenLabel = DEFAULT_TOKEN_LABEL, poMembers,
  } = usePOContext();
  const authority = useAuthorityEvidence();
  const { safeFetchFromIpfs, safeFetchImageFromIpfs } = useIPFScontext();

  // State for IPFS metadata
  const [orgMetadata, setOrgMetadata] = useState({
    description: '',
    links: [],
    template: '',
    logo: null,
  });
  const [metadataLoading, setMetadataLoading] = useState(true);

  const client = useSubgraphClient(subgraphUrl);

  // Fetch org structure data from subgraph
  const { data, loading: queryLoading, error, refetch } = useQuery(FETCH_ORG_STRUCTURE_DATA, {
    variables: { orgId },
    skip: !orgId || !subgraphUrl,
    fetchPolicy: 'cache-first',
    client,
  });

  // Role member-counts / claimability go stale after someone claims a role — refetch on the same
  // event the rest of the app uses (cheap: fires once per claim in this tab).
  useRefreshSubscription(RefreshEvent.ROLE_CLAIMED, () => refetch?.(), [refetch]);

  const org = data?.organization?.id?.toLowerCase() === orgId?.toLowerCase() ? data?.organization : null;

  // Load org metadata from subgraph (preferred) or IPFS (fallback)
  useEffect(() => {
    let alive = true;
    setOrgMetadata({ description: '', links: [], template: '', logo: null });
    async function fetchMetadata() {
      if (!org?.metadataHash) {
        setMetadataLoading(false);
        return;
      }

      setMetadataLoading(true);

      try {
        let logoCid = null;

        if (org.metadata) {
          // Subgraph already indexed the metadata — use it directly
          setOrgMetadata({
            description: org.metadata.description || '',
            links: org.metadata.links || [],
            template: org.metadata.template || '',
            logo: null,
          });
          logoCid = org.metadata.logo || null;
        } else {
          // Fallback: fetch from IPFS directly (subgraph hasn't indexed yet)
          const metadata = await safeFetchFromIpfs(org.metadataHash);
          if (!alive) return;
          if (metadata) {
            setOrgMetadata({
              description: metadata.description || '',
              links: metadata.links || [],
              template: metadata.template || '',
              logo: null,
            });
            logoCid = metadata.logo || null;
          }
        }

        // Fetch logo image from IPFS gateway using the CID
        if (logoCid) {
          const logoUrl = await safeFetchImageFromIpfs(logoCid);
          if (!alive) return;
          if (logoUrl) {
            setOrgMetadata(prev => ({ ...prev, logo: logoUrl }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch org metadata:', err);
      } finally {
        if (alive) setMetadataLoading(false);
      }
    }

    fetchMetadata();
    return () => { alive = false; };
  }, [orgId, subgraphUrl, org?.metadataHash, org?.metadata, safeFetchFromIpfs, safeFetchImageFromIpfs]);

  // Strip the EligibilityModule's admin hat from the raw role list before
  // any other downstream logic touches it. `where: { isUserRole: true }`
  // in the GraphQL query is supposed to exclude system hats, but the
  // deployed subgraph has historical orgs (e.g. Test6, plant-houston)
  // whose admin hat ended up with isUserRole = true. POContext already
  // filters this hat out of `roleHatIds`; the team page goes through a
  // separate query path, so it needs the same defensive treatment.
  const eligibilityAdminHatId =
    org?.eligibilityModule?.eligibilityModuleAdminHat || null;
  const filteredRoles = useMemo(() => {
    if (!org?.roles) return undefined;
    if (!eligibilityAdminHatId) return org.roles;
    return org.roles.filter(
      (r) => String(r.hatId) !== String(eligibilityAdminHatId),
    );
  }, [org?.roles, eligibilityAdminHatId]);

  // Native subjects preserve adopted IDs. Missing native facts never revive historical gates.
  const roles = useMemo(() => {
    const subjects = authority.snapshot?.data?.subjects || [];
    const complete = authority.complete && !authority.error;
    const quickJoinIds = org?.quickJoin?.memberHatIds;
    const quickJoinKnown = Array.isArray(quickJoinIds);
    const rows = subjects.filter(subject => subject.kind === 'Role' && !isLegacyTopHatId(subject.subjectId));
    if (complete && !rows.length) return [];
    if (!rows.length) return transformRolesData(filteredRoles, roleHatIds, {}, org?.users).map(role => ({
      ...role, ...enrollmentRoleFacts(null, false), defaultEligible: null, isQuickJoinEligible: null,
    }));
    return rows.map(subject => {
      const historical = filteredRoles?.find(role => normalizeHatId(role.hatId) === normalizeHatId(subject.subjectId));
      const display = transformRolesData([{ ...historical, id: subject.raw?.id || subject.subjectId,
        hatId: subject.subjectId, name: subject.name ?? historical?.name }], roleHatIds, {}, org?.users)[0];
      const facts = enrollmentRoleFacts(subject, complete);
      return { ...display, ...facts, defaultEligible: facts.isOpen,
        isQuickJoinEligible: quickJoinKnown && facts.openKnown && facts.vouchingKnown
          ? quickJoinIds.some(id => normalizeHatId(id) === normalizeHatId(subject.subjectId)) && facts.isOpen && !facts.vouchingEnabled : null };
    });
  }, [authority.snapshot, authority.complete, authority.error, filteredRoles, roleHatIds, org?.users, org?.quickJoin?.memberHatIds]);

  const { permissionsMatrix, permissionColumns } = useMemo(() => orgStructurePermissions({
    snapshot: authority.error ? null : authority.snapshot, scope: authority.scope, roles, tokenLabel,
  }), [authority.snapshot, authority.scope, authority.error, roles, tokenLabel]);

  // Group members by role
  const membersByRole = useMemo(() => {
    return groupMembersByRole(org?.users, roles);
  }, [org?.users, roles]);

  // Governance config
  const governance = useMemo(() => {
    return {
      hybridVoting: org?.hybridVoting ? {
        id: org.hybridVoting.id,
        quorum: org.hybridVoting.thresholdPct,
      } : null,
      directDemocracyVoting: org?.directDemocracyVoting ? {
        id: org.directDemocracyVoting.id,
        quorumPercentage: org.directDemocracyVoting.thresholdPct,
      } : null,
    };
  }, [org?.hybridVoting, org?.directDemocracyVoting]);

  // Contract addresses for developer section
  const contracts = useMemo(() => {
    if (!org) return {};
    return {
      executor: org.executorContract?.id,
      hybridVoting: org.hybridVoting?.id,
      directDemocracyVoting: org.directDemocracyVoting?.id,
      taskManager: org.taskManager?.id,
      educationHub: org.educationHub?.id,
      quickJoin: org.quickJoin?.id,
      participationToken: org.participationToken?.id,
    };
  }, [org]);

  // Token info
  const tokenInfo = useMemo(() => {
    if (!org?.participationToken) return null;
    return {
      name: org.participationToken.name,
      symbol: org.participationToken.symbol,
      totalSupply: formatTokenAmount(org.participationToken.totalSupply || '0'),
    };
  }, [org?.participationToken]);

  // Loading state
  const loading = queryLoading || metadataLoading || authority.loading;

  // Total member count
  const totalMembers = poMembers ?? null;

  // Deployment date
  const deployedAt = org?.deployedAt ? new Date(parseInt(org.deployedAt, 10) * 1000) : null;

  // Eligibility module address for claiming roles
  const eligibilityModuleAddress = org?.eligibilityModule?.id || null;

  return {
    // Organization info
    orgId,
    orgName: org?.name || '',
    orgMetadata,
    deployedAt,
    totalMembers,
    topHatId,

    // Roles and hierarchy
    roles,
    roleHatIds,

    // Eligibility module for claiming
    eligibilityModuleAddress,

    // Permissions
    permissionsMatrix,
    permissionColumns,

    // Members
    membersByRole,

    // Governance
    governance,

    // Contracts (for developer section)
    contracts,

    // Token info
    tokenInfo,

    // State
    loading,
    error: error || authority.error,
  };
}

export default useOrgStructure;
