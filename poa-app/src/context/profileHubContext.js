//profileHubContext

import React, { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { NETWORKS } from '@/config/networks';
import { loadProfileHubDirectory, profileHubOrganization } from '@/context/profileHubDirectory';

const ProfileHubContext = createContext();

// Calling this hook lazily triggers the cross-chain org fetch — the provider
// itself does nothing until a consumer subscribes. Keeps the marketing landing
// (the dominant entry path) from fanning out FetchAllOrgs to every mainnet
// subgraph on every visit.
export const useProfileHubContext = () => {
    const ctx = useContext(ProfileHubContext);
    useEffect(() => {
        ctx?.ensureLoaded?.();
    }, [ctx]);
    return ctx;
};

export const ProfileHubProvider = ({ children }) => {
    const [allOrgs, setAllOrgs] = useState([]);
    const [taskCounts, setTaskCounts] = useState({});
    const [memberTotals, setMemberTotals] = useState({});
    // Default to loading=true so consumers see a skeleton from frame 1 (no
    // empty-state flash). The actual network fetch is deferred until a
    // consumer subscribes via useProfileHubContext() — pages that never read
    // the org list (every non-/explore route) avoid the cross-chain fan-out
    // entirely.
    const [loading, setLoading] = useState(true);
    const [unavailableChains, setUnavailableChains] = useState([]);
    const startedRef = useRef(false);
    const generation = useRef(0);
    const previousOrgs = useRef([]);
    useEffect(() => () => { generation.current++; startedRef.current = false; }, []);

    const load = useCallback((retry = false) => {
        if (startedRef.current && !retry) return;
        startedRef.current = true;
        const request = ++generation.current;
        setLoading(true);
        setTaskCounts({});
        setMemberTotals({});
        return loadProfileHubDirectory(Object.values(NETWORKS).filter(n => !n.isTestnet), {
            previous: previousOrgs.current,
            force: retry,
            isCurrent: () => generation.current === request,
            onDirectory: (orgs, unavailable) => {
                previousOrgs.current = orgs;
                setAllOrgs(orgs);
                setUnavailableChains(unavailable);
                setLoading(false);
            },
            onCounts: counts => setTaskCounts(previous => ({ ...previous, ...counts })),
            onMemberTotals: totals => setMemberTotals(previous => ({ ...previous, ...totals })),
        });
    }, []);
    const ensureLoaded = useCallback(() => load(), [load]);
    const refetch = useCallback(() => load(true), [load]);

    const perpetualOrganizations = useMemo(() => {
        return allOrgs.map(org => profileHubOrganization(org, taskCounts, memberTotals));
    }, [allOrgs, taskCounts, memberTotals]);

    const contextValue = useMemo(() => ({
        perpetualOrganizations,
        isLoading: loading,
        isComplete: unavailableChains.length === 0 && !loading,
        unavailableChains,
        refetch,
        ensureLoaded,
    }), [perpetualOrganizations, loading, unavailableChains, refetch, ensureLoaded]);

    return (
        <ProfileHubContext.Provider value={contextValue}>
            {children}
        </ProfileHubContext.Provider>
    );
};
