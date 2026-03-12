import React, { createContext, useContext, useReducer, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@apollo/client';
import { GET_ORG_BY_NAME, FETCH_ORG_FULL_DATA } from '../util/queries';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import { useAuth } from './AuthContext';
import { formatTokenAmount } from '../util/formatToken';
import { useRefreshSubscription, RefreshEvent } from './RefreshContext';
import { bytes32ToIpfsCid } from '@/services/web3/utils/encoding';
import { useIPFScontext } from './ipfsContext';
import { NETWORKS, SOURCE_TO_NETWORK } from '../config/networks';

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
        return {
            id: module.id,
            moduleId: module.moduleId,
            name: module.title || 'Indexing...',
            ipfsHash: ipfsCid,
            // Keep original bytes32 hash for any components that need it
            contentHashBytes32: module.contentHash,
            payout: formatTokenAmount(module.payout || '0'),
            status: module.status,
            // Content from IPFS needs to be fetched separately
            isIndexing: !module.contentHash,
            description: 'Module content loading from IPFS...',
            link: '',
            question: '',
            answers: [],
            completions: module.completions || [],
            // For backward compatibility
            completetions: module.completions || [],
        };
    });
}

const initialState = {
    // Organization info
    orgId: null,
    orgChainId: null,
    poDescription: 'No description provided or IPFS content still being indexed',
    poLinks: {},
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

    // Step 1: Look up org by name to get bytes ID
    const { data: orgLookupData, loading: orgLookupLoading, error: orgLookupError } = useQuery(GET_ORG_BY_NAME, {
        variables: { name: poName },
        skip: !poName,
        fetchPolicy: 'cache-first',
        onCompleted: (data) => {
            if (data?.organizations?.[0]) {
                const org = data.organizations[0];
                const network = SOURCE_TO_NETWORK[org._sourceName] || Object.values(NETWORKS)[0];
                dispatch({
                    type: 'SET_ORG_DATA',
                    payload: { orgId: org.id, orgChainId: network.chainId },
                });
            }
        },
    });

    // Step 2: Fetch full org data using bytes ID
    const { data: orgData, loading: orgDataLoading, error: orgDataError, refetch: refetchOrgData } = useQuery(FETCH_ORG_FULL_DATA, {
        variables: { orgId: state.orgId },
        skip: !state.orgId,
        fetchPolicy: 'cache-first',
    });

    // Handle refresh events from Web3 transactions
    const handleRefresh = useCallback(() => {
        if (state.orgId && refetchOrgData) {
            // Small delay to allow subgraph to index the new data
            setTimeout(() => {
                refetchOrgData();
            }, 2000);
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
            let poLinks = {};
            if (org.metadata) {
                poDescription = org.metadata.description || 'No description provided';
                if (org.metadata.links && org.metadata.links.length > 0) {
                    const linksObj = {};
                    org.metadata.links.forEach(link => {
                        linksObj[link.name] = link.url;
                    });
                    poLinks = linksObj;
                }
            } else if (org.metadataHash) {
                poDescription = 'Organization description loading from IPFS...';
            }

            // Single atomic dispatch replaces 25+ individual setState calls
            dispatch({
                type: 'SET_ORG_DATA',
                payload: {
                    logoHash: org.metadataHash || '',
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

    // Fetch logo CID from IPFS metadata JSON
    // The subgraph OrgMetadata entity doesn't index the 'logo' field,
    // so we extract it from IPFS directly.
    useEffect(() => {
        async function fetchLogoFromMetadata() {
            const org = orgData?.organization;
            if (!org?.metadataHash) {
                dispatch({ type: 'SET_LOGO_URL', payload: '' });
                return;
            }
            try {
                const metadata = await safeFetchFromIpfs(org.metadataHash);
                dispatch({ type: 'SET_LOGO_URL', payload: metadata?.logo || '' });
            } catch (e) {
                console.warn('[POContext] Failed to fetch logo from IPFS metadata:', e);
                dispatch({ type: 'SET_LOGO_URL', payload: '' });
            }
        }
        fetchLogoFromMetadata();
    }, [orgData, safeFetchFromIpfs]);

    // Combined loading and error states
    const loading = orgLookupLoading || orgDataLoading;
    const error = orgLookupError || orgDataError;

    // Handle case where org not found
    useEffect(() => {
        if (orgLookupData && !orgLookupData.organizations?.[0] && !orgLookupLoading) {
            console.warn(`Organization "${poName}" not found in subgraph`);
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [orgLookupData, orgLookupLoading, poName]);

    const contextValue = useMemo(() => ({
        // Organization info
        orgId: state.orgId,
        orgChainId: state.orgChainId,
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
        roleNames: state.roleNames,
    }), [state, loading, error, leaderboardDisplayData]);

    return (
        <POContext.Provider value={contextValue}>
            {error && <div>Error: {error.message}</div>}
            {children}
        </POContext.Provider>
    );
};
