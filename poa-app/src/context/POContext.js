import React, { createContext, useContext, useReducer, useEffect, useMemo, useCallback, useState } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_ORG_FULL_DATA } from '../util/queries';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import { useAuth } from './AuthContext';
import { formatTokenAmount } from '../util/formatToken';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';
import { bytes32ToIpfsCid } from '@/services/web3/utils/encoding';
import { useIPFScontext } from './ipfsContext';
import { getSubgraphUrl, getAllSubgraphUrls } from '../config/networks';

const POContext = createContext();

export const usePOContext = () => useContext(POContext);

// Zero address constant - educationHub.id will be this when edu hub is disabled
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Transform users array to leaderboard format
function transformLeaderboardData(users, roleHatIds) {
    if (!users || !Array.isArray(users)) {
        return [];
    }
    return users.map(user => {
        const rawBalance = user.participationTokenBalance;
        const formattedBalance = formatTokenAmount(rawBalance || '0');
        return {
            id: user.id,
            address: user.address,
            name: user.account?.username || user.address?.slice(0, 8) + '...',
            hasUsername: !!user.account?.username,
            token: formattedBalance,
            // Derive role from hat IDs - first hat is typically the primary role
            hatIds: user.currentHatIds || [],
            totalTasksCompleted: parseInt(user.totalTasksCompleted, 10) || 0,
            totalVotes: parseInt(user.totalVotes, 10) || 0,
        };
    });
}

// Transform education modules from new schema
function transformEducationModules(modules) {
    if (!modules || !Array.isArray(modules)) {
        return [];
    }
    return modules.map(module => {
        // Convert bytes32 contentHash to CID format for IPFS gateway URLs
        const ipfsCid = module.contentHash ? bytes32ToIpfsCid(module.contentHash) : null;

        // Use subgraph-indexed metadata when available
        const meta = module.metadata;
        let description = 'Module content loading from IPFS...';
        let link = '';
        let question = '';
        let answers = [];
        let ipfsFetched = false;

        if (meta) {
            description = meta.description || 'No description available';
            link = meta.link || '';
            question = (meta.quiz && meta.quiz.length > 0) ? meta.quiz[0] : '';
            if (meta.answersJson) {
                try {
                    const parsed = JSON.parse(meta.answersJson);
                    answers = (parsed[0] || []).map((ans, i) => ({ index: i, answer: ans }));
                } catch (e) {
                    // Fall back to empty answers if JSON parsing fails
                }
            }
            ipfsFetched = true;
        }

        return {
            id: module.id,
            moduleId: module.moduleId,
            name: module.title || 'Indexing...',
            ipfsHash: ipfsCid,
            // Keep original bytes32 hash for any components that need it
            contentHashBytes32: module.contentHash,
            payout: formatTokenAmount(module.payout || '0'),
            status: module.status,
            isIndexing: !module.contentHash,
            description,
            link,
            question,
            answers,
            completions: module.completions || [],
            // For backward compatibility
            completetions: module.completions || [],
            _ipfsFetched: ipfsFetched,
        };
    });
}

const initialState = {
    // Organization info
    orgId: null,
    orgChainId: null,
    poDescription: 'No description provided or IPFS content still being indexed',
    poLinks: [],
    logoHash: '',
    logoUrl: '',
    metadataAdminHatId: null,
    poMembers: 0,
    activeTaskAmount: 0,
    completedTaskAmount: 0,
    ptTokenBalance: 0,

    // Contract addresses
    quickJoinContractAddress: '',
    treasuryContractAddress: '',
    taskManagerContractAddress: '',
    hybridVotingContractAddress: '',
    participationVotingContractAddress: '',
    directDemocracyVotingContractAddress: '',
    ddTokenContractAddress: '',
    nftMembershipContractAddress: '',
    votingContractAddress: '',
    educationHubAddress: '',
    executorContractAddress: '',
    eligibilityModuleAddress: '',
    participationTokenAddress: '',

    // Derived data
    leaderboardData: [],
    poContextLoading: true,
    rules: null,
    educationModules: [],
    roleHatIds: [],
    topHatId: null,
    creatorHatIds: [],
    educationHubEnabled: false,
    hideTreasury: false,
    roleNames: {},
};

function poReducer(state, action) {
    switch (action.type) {
        case 'SET_ORG_DATA':
            return { ...state, ...action.payload };
        case 'SET_LOGO_URL':
            return { ...state, logoUrl: action.payload };
        case 'SET_LOADING':
            return { ...state, poContextLoading: action.payload };
        default:
            return state;
    }
}

export const POProvider = ({ children }) => {
    const { address } = useAccount();
    const { accountAddress: authAddress } = useAuth();
    const router = useRouter();
    const poName = router.query.userDAO || '';
    const { safeFetchFromIpfs } = useIPFScontext();

    const [state, dispatch] = useReducer(poReducer, initialState);

    // Filtered leaderboard for display (only users with registered usernames)
    const leaderboardDisplayData = useMemo(() => {
        return state.leaderboardData.filter(user => user.hasUsername);
    }, [state.leaderboardData]);

    // Step 1: Look up org by name across all chains via parallel fetch
    const [orgLookupLoading, setOrgLookupLoading] = useState(!!poName);
    const [orgLookupError, setOrgLookupError] = useState(null);

    useEffect(() => {
        if (!poName) {
            setOrgLookupLoading(false);
            return;
        }
        let cancelled = false;
        setOrgLookupLoading(true);
        setOrgLookupError(null);

        async function findOrg() {
            const sources = getAllSubgraphUrls();
            try {
                const results = await Promise.all(sources.map(async (source) => {
                    try {
                        const res = await fetch(source.url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                query: 'query FindOrg($name: String!) { organizations(where: { name: $name }, first: 1) { id name } }',
                                variables: { name: poName },
                            }),
                        });
                        const json = await res.json();
                        const org = json?.data?.organizations?.[0];
                        return org ? { ...org, chainId: source.chainId } : null;
                    } catch (err) {
                        console.warn(`[POContext] Failed to query ${source.name}:`, err.message);
                        return null;
                    }
                }));
                if (cancelled) return;
                const found = results.find(Boolean);
                if (found) {
                    dispatch({
                        type: 'SET_ORG_DATA',
                        payload: { orgId: found.id, orgChainId: found.chainId },
                    });
                } else {
                    console.warn(`[POContext] Organization "${poName}" not found on any chain`);
                    dispatch({ type: 'SET_LOADING', payload: false });
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('[POContext] Org lookup failed:', err);
                    setOrgLookupError(err);
                }
            } finally {
                if (!cancelled) setOrgLookupLoading(false);
            }
        }

        findOrg();
        return () => { cancelled = true; };
    }, [poName]);

    // Step 2: Fetch full org data using bytes ID, routed to the correct chain's subgraph
    const subgraphUrl = getSubgraphUrl(state.orgChainId);

    const { data: orgData, loading: orgDataLoading, error: orgDataError, refetch: refetchOrgData } = useQuery(FETCH_ORG_FULL_DATA, {
        variables: { orgId: state.orgId },
        skip: !state.orgId,
        fetchPolicy: 'cache-first',
        context: { subgraphUrl },
    });

    // Handle refresh events from Web3 transactions
    const handleRefresh = useCallback(() => {
        if (state.orgId && refetchOrgData) {
            // Delay to allow subgraph to index on mainnet (Arbitrum/Gnosis)
            setTimeout(() => {
                refetchOrgData();
            }, 5000);
        }
    }, [state.orgId, refetchOrgData]);

    // Subscribe to relevant events
    useRefreshSubscription(
        [
            RefreshEvent.MEMBER_JOINED,
            RefreshEvent.MODULE_CREATED,
            RefreshEvent.MODULE_COMPLETED,
            RefreshEvent.TASK_COMPLETED, // Updates user stats
            RefreshEvent.METADATA_UPDATED, // Updates org metadata (name, description, etc.)
        ],
        handleRefresh,
        [handleRefresh]
    );

    // Process org data when available — single atomic dispatch
    useEffect(() => {
        if (orgData?.organization) {
            const org = orgData.organization;

            // Build role names map from roles data
            const roleNamesMap = {};
            if (org.roles && Array.isArray(org.roles)) {
                org.roles.forEach((role, index) => {
                    const hatId = role.hatId;
                    const name = role.name || role.hat?.name || `Role ${index + 1}`;
                    roleNamesMap[hatId] = name;
                    roleNamesMap[String(hatId)] = name;
                });
            }

            // Calculate task counts from taskManager projects
            let activeTasks = 0;
            let completedTasks = 0;
            if (org.taskManager?.projects) {
                org.taskManager.projects.forEach(project => {
                    project.tasks?.forEach(task => {
                        if (task.status === 'Completed') {
                            completedTasks++;
                        } else if (task.status !== 'Cancelled') {
                            activeTasks++;
                        }
                    });
                });
            }

            // Process education modules
            const modules = org.educationHub?.modules || [];

            // Build metadata fields
            const eduHubId = org.educationHub?.id || '';
            const adminHat = org.metadataAdminHatId;

            let poDescription = 'No description provided or IPFS content still being indexed';
            let poLinks = [];
            if (org.metadata) {
                poDescription = org.metadata.description || 'No description provided';
                if (org.metadata.links && org.metadata.links.length > 0) {
                    poLinks = org.metadata.links.map(link => ({
                        name: link.name,
                        url: link.url,
                    }));
                }
            } else if (org.metadataHash) {
                poDescription = 'Organization description loading from IPFS...';
            }

            // Single atomic dispatch replaces 25+ individual setState calls
            dispatch({
                type: 'SET_ORG_DATA',
                payload: {
                    logoHash: org.metadataHash || '',
                    logoUrl: org.metadata?.logo || '',
                    hideTreasury: org.metadata?.hideTreasury === true,
                    poMembers: org.users?.length || 0,
                    ptTokenBalance: formatTokenAmount(org.participationToken?.totalSupply || '0'),
                    topHatId: org.topHatId,
                    roleHatIds: org.roleHatIds || [],
                    metadataAdminHatId: adminHat && adminHat !== '0' ? adminHat : null,
                    creatorHatIds: org.taskManager?.creatorHatIds || [],
                    roleNames: roleNamesMap,
                    quickJoinContractAddress: org.quickJoin?.id || '',
                    taskManagerContractAddress: org.taskManager?.id || '',
                    hybridVotingContractAddress: org.hybridVoting?.id || '',
                    directDemocracyVotingContractAddress: org.directDemocracyVoting?.id || '',
                    educationHubAddress: eduHubId,
                    educationHubEnabled: !!(eduHubId && eduHubId !== ZERO_ADDRESS),
                    executorContractAddress: org.executorContract?.id || '',
                    eligibilityModuleAddress: org.eligibilityModule?.id || '',
                    participationTokenAddress: org.participationToken?.id || '',
                    participationVotingContractAddress: org.hybridVoting?.id || '',
                    votingContractAddress: org.hybridVoting?.id || '',
                    treasuryContractAddress: org.executorContract?.id || '',
                    ddTokenContractAddress: '',
                    nftMembershipContractAddress: '',
                    activeTaskAmount: activeTasks,
                    completedTaskAmount: completedTasks,
                    educationModules: transformEducationModules(modules),
                    leaderboardData: transformLeaderboardData(org.users, org.roleHatIds),
                    rules: {
                        HybridVoting: org.hybridVoting ? {
                            id: org.hybridVoting.id,
                            quorum: org.hybridVoting.thresholdPct,
                        } : null,
                        DirectDemocracyVoting: org.directDemocracyVoting ? {
                            id: org.directDemocracyVoting.id,
                            quorum: org.directDemocracyVoting.thresholdPct,
                        } : null,
                        ParticipationVoting: org.hybridVoting ? {
                            id: org.hybridVoting.id,
                            quorum: org.hybridVoting.thresholdPct,
                        } : null,
                        NFTMembership: null,
                        Treasury: org.executorContract ? {
                            id: org.executorContract.id,
                        } : null,
                    },
                    poDescription,
                    poLinks,
                    poContextLoading: false,
                },
            });
        }
    }, [orgData]);

    // Fetch logo and hideTreasury from IPFS metadata — only as fallback
    // when the subgraph hasn't indexed org metadata yet.
    useEffect(() => {
        async function fetchMetadataFromIpfs() {
            const org = orgData?.organization;
            if (!org?.metadataHash) {
                return;
            }
            // Skip IPFS fetch if subgraph already has metadata indexed
            if (org.metadata) {
                return;
            }
            try {
                const metadata = await safeFetchFromIpfs(org.metadataHash);
                dispatch({ type: 'SET_LOGO_URL', payload: metadata?.logo || '' });
                dispatch({ type: 'SET_ORG_DATA', payload: { hideTreasury: metadata?.hideTreasury === true } });
            } catch (e) {
                console.warn('[POContext] Failed to fetch metadata from IPFS:', e);
            }
        }
        fetchMetadataFromIpfs();
    }, [orgData, safeFetchFromIpfs]);

    // Fetch IPFS content for education modules (description, quiz, answers, link)
    // The subgraph only stores title + contentHash; the rest lives in IPFS.
    useEffect(() => {
        async function fetchModuleContent() {
            const modules = state.educationModules;
            if (!modules || modules.length === 0) return;

            const modulesNeedingFetch = modules.filter(m => m.ipfsHash && !m._ipfsFetched);
            if (modulesNeedingFetch.length === 0) return;

            const updated = await Promise.all(
                modules.map(async (module) => {
                    if (!module.ipfsHash || module._ipfsFetched) return module;
                    try {
                        const content = await safeFetchFromIpfs(module.ipfsHash);
                        if (!content) return { ...module, _ipfsFetched: true };
                        return {
                            ...module,
                            description: content.description || module.description,
                            link: content.link || '',
                            question: content.quiz?.[0] || '',
                            answers: (content.answers?.[0] || []).map((ans, i) => ({
                                index: i,
                                answer: ans,
                            })),
                            _ipfsFetched: true,
                        };
                    } catch (e) {
                        console.warn('[POContext] Failed to fetch education module IPFS content:', e);
                        return { ...module, _ipfsFetched: true };
                    }
                })
            );

            dispatch({
                type: 'SET_ORG_DATA',
                payload: { educationModules: updated },
            });
        }
        fetchModuleContent();
    }, [state.educationModules, safeFetchFromIpfs]);

    // Combined loading and error states
    const loading = orgLookupLoading || orgDataLoading;
    const error = orgLookupError || orgDataError;

    // Note: "org not found" is handled inline in the parallel fetch above

    const contextValue = useMemo(() => ({
        // Organization info
        orgId: state.orgId,
        orgChainId: state.orgChainId,
        subgraphUrl,
        poDescription: state.poDescription,
        poLinks: state.poLinks,
        logoHash: state.logoHash,
        logoUrl: state.logoUrl,
        metadataAdminHatId: state.metadataAdminHatId,
        poMembers: state.poMembers,
        activeTaskAmount: state.activeTaskAmount,
        completedTaskAmount: state.completedTaskAmount,
        ptTokenBalance: state.ptTokenBalance,

        // Contract addresses
        quickJoinContractAddress: state.quickJoinContractAddress,
        treasuryContractAddress: state.treasuryContractAddress,
        taskManagerContractAddress: state.taskManagerContractAddress,
        hybridVotingContractAddress: state.hybridVotingContractAddress,
        participationVotingContractAddress: state.participationVotingContractAddress,
        directDemocracyVotingContractAddress: state.directDemocracyVotingContractAddress,
        ddTokenContractAddress: state.ddTokenContractAddress,
        nftMembershipContractAddress: state.nftMembershipContractAddress,
        votingContractAddress: state.votingContractAddress,
        educationHubAddress: state.educationHubAddress,
        executorContractAddress: state.executorContractAddress,
        eligibilityModuleAddress: state.eligibilityModuleAddress,
        participationTokenAddress: state.participationTokenAddress,

        // Derived data
        loading,
        error,
        leaderboardData: state.leaderboardData,
        leaderboardDisplayData,
        poContextLoading: state.poContextLoading,
        rules: state.rules,
        educationModules: state.educationModules,

        // POP-specific data
        roleHatIds: state.roleHatIds,
        topHatId: state.topHatId,
        creatorHatIds: state.creatorHatIds,
        educationHubEnabled: state.educationHubEnabled,
        hideTreasury: state.hideTreasury,
        roleNames: state.roleNames,
    }), [state, loading, error, leaderboardDisplayData, subgraphUrl]);

    return (
        <POContext.Provider value={contextValue}>
            {error && <div>Error: {error.message}</div>}
            {children}
        </POContext.Provider>
    );
};
