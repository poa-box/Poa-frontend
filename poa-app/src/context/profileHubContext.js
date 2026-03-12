//profileHubContext

import React, { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_ALL_ORGS } from '../util/queries';
import { NETWORKS, SOURCE_TO_NETWORK } from '../config/networks';

const ProfileHubContext = createContext();

export const useprofileHubContext = () => {
    return useContext(ProfileHubContext);
};

export const ProfileHubProvider = ({ children }) => {
    const { data, loading } = useQuery(FETCH_ALL_ORGS, {
        fetchPolicy: 'cache-first',
    });

    const perpetualOrganizations = useMemo(() => {
        const orgs = data?.organizations || [];
        return orgs.map(org => {
            const network = SOURCE_TO_NETWORK[org._sourceName] || Object.values(NETWORKS)[0];
            return {
                id: org.name || org.id,
                orgId: org.id,
                logoHash: org.metadataHash,
                totalMembers: org.users?.length || 0,
                aboutInfo: null,
                deployedAt: org.deployedAt,
                quickJoinContract: org.quickJoin?.id,
                participationToken: org.participationToken,
                chainId: network.chainId,
                networkName: network.name,
                sourceName: org._sourceName,
            };
        });
    }, [data]);

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
