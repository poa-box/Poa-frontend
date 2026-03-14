//profileHubContext

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { NETWORKS } from '../config/networks';

const ProfileHubContext = createContext();

export const useprofileHubContext = () => {
    return useContext(ProfileHubContext);
};

/**
 * Raw GQL string for fetching all orgs.
 * Direct fetch() per-subgraph to query all chains in parallel.
 */
const ALL_ORGS_QUERY = `
  query FetchAllOrgs {
    organizations(first: 100, orderBy: deployedAt, orderDirection: desc) {
      id
      name
      metadataHash
      deployedAt
      metadata { description }
      participationToken { id totalSupply }
      quickJoin { id }
      hybridVoting { id }
      directDemocracyVoting { id }
      taskManager { id }
      educationHub { id }
      users { id }
    }
  }
`;

/**
 * Fetches orgs from a single subgraph endpoint.
 * Returns [] on failure so one broken source doesn't block the page.
 */
async function fetchOrgsFromSource(endpoint, networkConfig) {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: ALL_ORGS_QUERY }),
        });
        const json = await res.json();
        const orgs = json?.data?.organizations || [];
        return orgs.map(org => ({
            ...org,
            _network: networkConfig,
        }));
    } catch (err) {
        console.warn(`[ProfileHub] Failed to fetch from ${networkConfig.name}:`, err.message);
        return [];
    }
}

export const ProfileHubProvider = ({ children }) => {
    const [allOrgs, setAllOrgs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function fetchAll() {
            const entries = Object.values(NETWORKS);
            const results = await Promise.all(
                entries.map(net => fetchOrgsFromSource(net.subgraphUrl, net))
            );
            if (!cancelled) {
                // Flatten, sort by deployedAt descending
                const merged = results.flat().sort((a, b) =>
                    Number(b.deployedAt || 0) - Number(a.deployedAt || 0)
                );
                setAllOrgs(merged);
                setLoading(false);
            }
        }

        fetchAll();
        return () => { cancelled = true; };
    }, []);

    const perpetualOrganizations = useMemo(() => {
        return allOrgs.map(org => {
            const network = org._network;
            return {
                id: org.name || org.id,
                orgId: org.id,
                logoHash: org.metadataHash,
                totalMembers: org.users?.length || 0,
                aboutInfo: org.metadata || null,
                deployedAt: org.deployedAt,
                quickJoinContract: org.quickJoin?.id,
                participationToken: org.participationToken,
                chainId: network.chainId,
                networkName: network.name,
            };
        });
    }, [allOrgs]);

    const contextValue = useMemo(() => ({
        perpetualOrganizations,
        isLoading: loading,
    }), [perpetualOrganizations, loading]);

    return (
        <ProfileHubContext.Provider value={contextValue}>
            {children}
        </ProfileHubContext.Provider>
    );
};
