/**
 * Web3Context - Minimal context for network modal state
 *
 * Note: All contract interactions (voting, tasks, education, etc.)
 * have been migrated to the new service layer in /services/web3/
 * Use the useWeb3 hook from /hooks for those operations.
 */
import React, { createContext, useState, useContext, useMemo, useCallback } from 'react';

const Web3Context = createContext();

export const useWeb3Context = () => {
    return useContext(Web3Context);
}

export const Web3Provider = ({ children }) => {
    const [isNetworkModalOpen, setNetworkModalOpen] = useState(false);

    const closeNetworkModal = useCallback(() => {
        setNetworkModalOpen(false);
    }, []);

    const contextValue = useMemo(() => ({
        isNetworkModalOpen,
        closeNetworkModal,
    }), [isNetworkModalOpen, closeNetworkModal]);

    return (
        <Web3Context.Provider value={contextValue}>
            {children}
        </Web3Context.Provider>
    );
};
