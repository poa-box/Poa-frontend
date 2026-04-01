import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { useAccount } from 'wagmi';
import { useAuth } from './AuthContext';
import { FETCH_USER_DATA_NEW, FETCH_TOKEN_APPROVER_HATS } from '../util/queries';
import { useRouter } from 'next/router';
import { usePOContext } from './POContext';
import { formatTokenAmount } from '../util/formatToken';
import { useRefresh } from './RefreshContext';
import { findUsernameAcrossChains } from '../util/crossChainUsername';

const UserContext = createContext();

export const useUserContext = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
    const { address } = useAccount();
    const { accountAddress: authAddress } = useAuth();
    const router = useRouter();
    const { userDAO } = router.query;
    const { orgId, roleHatIds, participationTokenAddress, subgraphUrl } = usePOContext();

    const [userData, setUserData] = useState({});
    const [graphUsername, setGraphUsername] = useState('');
    const [hasExecRole, setHasExecRole] = useState(false);
    const [hasMemberRole, setHasMemberRole] = useState(false);
    const [hasApproverRole, setHasApproverRole] = useState(false);
    const [claimedTasks, setClaimedTasks] = useState([]);
    const [userProposals, setUserProposals] = useState([]);
    const [completedModules, setCompletedModules] = useState([]);
    const [userDataLoading, setUserDataLoading] = useState(true);

    // Optimistic lock: prevents stale subgraph data from overwriting optimistic join state.
    // Mirrors the pattern in TaskBoardContext.js.
    const optimisticLockRef = useRef(null);
    const OPTIMISTIC_GRACE_PERIOD = 15000; // 15s — covers 8s scheduled refetch + margin

    const [account, setAccount] = useState(null);

    // Use AuthContext's unified address (supports both EOA and passkey)
    const effectiveAddress = authAddress || address;

    useEffect(() => {
        if (effectiveAddress) {
            setAccount(effectiveAddress.toLowerCase());
        }
    }, [effectiveAddress]);

    // Construct the org-specific user ID
    const orgUserID = orgId && account ? `${orgId}-${account}` : null;

    const { data, error, loading, refetch } = useQuery(FETCH_USER_DATA_NEW, {
        variables: {
            orgUserID: orgUserID,
            userAddress: account,
        },
        skip: !orgUserID || !account,
        fetchPolicy: 'cache-first',
        context: { subgraphUrl },
    });

    // Query approver hats for the participation token
    const { data: approverHatsData } = useQuery(FETCH_TOKEN_APPROVER_HATS, {
        variables: { tokenAddress: participationTokenAddress },
        skip: !participationTokenAddress,
        fetchPolicy: 'cache-first',
        context: { subgraphUrl },
    });

    // Subscribe to role:claimed event to refetch user data
    const { subscribe } = useRefresh();

    const refetchUserData = useCallback(() => {
        if (orgUserID && account) {
            refetch();
        }
    }, [refetch, orgUserID, account]);

    useEffect(() => {
        const unsubscribe = subscribe('role:claimed', () => {
            // Wait for subgraph to index on mainnet, then refetch user data
            setTimeout(() => {
                refetchUserData();
            }, 5000);
        });
        return unsubscribe;
    }, [subscribe, refetchUserData]);

    // Subscribe to username_changed event to refetch user data
    useEffect(() => {
        const unsubscribe = subscribe('user:username_changed', () => {
            // Wait for subgraph to index on mainnet, then refetch user data
            setTimeout(() => {
                refetchUserData();
            }, 5000);
        });
        return unsubscribe;
    }, [subscribe, refetchUserData]);

    useEffect(() => {
        if (data) {
            // Optimistic lock: if optimisticJoin was recently called, check whether the
            // subgraph has caught up before accepting its data.
            if (optimisticLockRef.current) {
                const elapsed = Date.now() - optimisticLockRef.current;
                if (elapsed < OPTIMISTIC_GRACE_PERIOD) {
                    const serverHatIds = data.user?.currentHatIds || [];
                    if (serverHatIds.length === 0) {
                        // Subgraph hasn't indexed the join yet — keep optimistic state
                        return;
                    }
                }
                // Server caught up or grace period expired — clear lock
                optimisticLockRef.current = null;
            }

            const { user, account: accountData } = data;

            setGraphUsername(accountData?.username || '');
            // Check both that user exists AND has Active membership status
            const isActiveMember = user && user.membershipStatus === 'Active';
            setHasMemberRole(isActiveMember);

            if (user) {
                // Executive check: second role hat is typically executive
                const userHatIds = user.currentHatIds || [];
                const execHatId = roleHatIds?.[1];
                setHasExecRole(execHatId && userHatIds.includes(execHatId));

                // Approver check: user wears any hat with Approver permission on ParticipationToken
                const approverHatIds = (approverHatsData?.hatPermissions || []).map(p => p.hatId);
                const isApprover = approverHatIds.some(hatId => userHatIds.includes(hatId));
                setHasApproverRole(isApprover);

                setUserData({
                    id: user.id,
                    address: user.address,
                    participationTokenBalance: formatTokenAmount(user.participationTokenBalance || '0'),
                    hatIds: userHatIds,
                    tasksCompleted: user.totalTasksCompleted || 0,
                    totalVotes: user.totalVotes || 0,
                    firstSeenAt: user.firstSeenAt || null,
                    membershipStatus: user.membershipStatus,
                    completedTasks: (user.completedTasks || []).map(task => ({
                        id: task.id,
                        taskId: task.taskId,
                        title: task.title,
                        payout: formatTokenAmount(task.payout || '0'),
                        status: 'Completed',
                    })),
                });

                setClaimedTasks((user.assignedTasks || []).map(task => ({
                    id: task.id,
                    taskId: task.taskId,
                    title: task.title,
                    payout: formatTokenAmount(task.payout || '0'),
                    status: task.status,
                })));

                setCompletedModules((user.modulesCompleted || []).map(m => ({
                    moduleId: m.moduleId,
                    completedAt: m.completedAt,
                })));

                const proposals = user.hybridProposalsCreated || [];
                setUserProposals(proposals.map(p => ({
                    id: p.id,
                    proposalId: p.proposalId,
                    title: p.title,
                    type: 'Hybrid',
                    startTimestamp: p.startTimestamp,
                    endTimestamp: p.endTimestamp,
                    status: p.status,
                })).sort((a, b) => {
                    const aCompleted = a.status !== 'Active';
                    const bCompleted = b.status !== 'Active';
                    if (aCompleted && !bCompleted) return 1;
                    if (!aCompleted && bCompleted) return -1;
                    return parseInt(a.endTimestamp) - parseInt(b.endTimestamp);
                }));
            } else {
                setHasExecRole(false);
                setHasApproverRole(false);
                setUserData({});
                setClaimedTasks([]);
                setCompletedModules([]);
                setUserProposals([]);
            }

            setUserDataLoading(false);
        }
    }, [data, roleHatIds, approverHatsData]);

    // Cross-chain username fallback: if this chain's subgraph has no username
    // for the user, check all chains. The user may have registered on a different chain.
    useEffect(() => {
        if (graphUsername || !account || !data) return;
        let cancelled = false;
        findUsernameAcrossChains(account).then(({ username }) => {
            if (!cancelled && username) {
                setGraphUsername(username);
            }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [graphUsername, account, data]);

    useEffect(() => {
        if (!orgId && userDAO) {
            setUserDataLoading(true);
        }
    }, [orgId, userDAO]);

    useEffect(() => {
        if (!account && !loading) {
            setUserDataLoading(false);
        }
    }, [account, loading]);

    /**
     * Optimistically set user state after a successful join transaction.
     * This allows immediate redirect to profileHub without waiting for subgraph indexing.
     * The subgraph data will replace this on the next refetch.
     *
     * @param {{ address: string, hatIds: string[], username: string }} joinData
     */
    const optimisticJoin = useCallback(({ address: userAddr, hatIds, username }) => {
        const lowerAddr = userAddr?.toLowerCase();
        optimisticLockRef.current = Date.now();
        if (username) setGraphUsername(username);
        setHasMemberRole(true);
        // Optimistically set exec role if the claimed hat matches the exec hat (index 1).
        // Normalize both via BigInt for safe comparison between hex (frontend) and
        // decimal (subgraph) string representations.
        const execHat = roleHatIds?.[1];
        if (execHat && hatIds?.length > 0) {
            try {
                const execNorm = BigInt(execHat).toString();
                const hasExec = hatIds.some(h => BigInt(h).toString() === execNorm);
                if (hasExec) setHasExecRole(true);
            } catch {
                // If BigInt conversion fails, skip — subgraph will correct it on refetch
            }
        }
        setUserData(prev => ({
            ...prev,
            id: orgId ? `${orgId}-${lowerAddr}` : prev.id,
            address: lowerAddr || prev.address,
            hatIds: hatIds || prev.hatIds || [],
            membershipStatus: 'Active',
            participationTokenBalance: prev.participationTokenBalance || '0',
            tasksCompleted: prev.tasksCompleted || 0,
            totalVotes: prev.totalVotes || 0,
        }));
        setUserDataLoading(false);

        // Schedule a subgraph refetch to replace optimistic data with real data
        setTimeout(() => refetchUserData(), 8000);
    }, [orgId, roleHatIds, refetchUserData]);

    const contextValue = useMemo(() => ({
        userDataLoading,
        userProposals,
        userData,
        graphUsername,
        setGraphUsername,
        hasExecRole,
        hasMemberRole,
        hasApproverRole,
        claimedTasks,
        completedModules,
        error,
        refetchUserData,
        optimisticJoin,
    }), [
        userDataLoading,
        userProposals,
        userData,
        graphUsername,
        setGraphUsername,
        hasExecRole,
        hasMemberRole,
        hasApproverRole,
        claimedTasks,
        completedModules,
        error,
        refetchUserData,
        optimisticJoin,
    ]);

    return (
        <UserContext.Provider value={contextValue}>
            {children}
        </UserContext.Provider>
    );
};
