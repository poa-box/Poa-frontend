/**
 * Web3Context - Minimal context for network modal state
 *
 * Note: All contract interactions (voting, tasks, education, etc.)
 * have been migrated to the new service layer in /services/web3/
 * Use the useWeb3 hook from /hooks for those operations.
 */
import React, { createContext, useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useAccount } from "wagmi";
import { useEthersProvider, useEthersSigner } from '@/components/ProviderConverter';
import { useAuth } from './AuthContext';

const Web3Context = createContext();

export const useWeb3Context = () => {
    return useContext(Web3Context);
}

export const Web3Provider = ({ children }) => {
    const [isNetworkModalOpen, setNetworkModalOpen] = useState(false);
    const [account, setAccount] = useState("0x00");

    const { address, chainId } = useAccount();
    const provider = useEthersProvider();
    const signer = useEthersSigner();
    const { accountAddress } = useAuth();

    // Use AuthContext's unified address (supports both EOA and passkey)
    useEffect(() => {
        setAccount(accountAddress || address);
    }, [accountAddress, address]);

    const checkNetwork = useCallback(() => {
        if (chainId !== 560048) {
            setNetworkModalOpen(true);
            return false;
        }
        return true;
    }, [chainId]);

    const closeNetworkModal = useCallback(() => {
        setNetworkModalOpen(false);
    }, []);

    const contextValue = useMemo(() => ({
        address,
        chainId,
        signer,
        provider,
        account,
        setAccount,
        isNetworkModalOpen,
        closeNetworkModal,
        checkNetwork,
    }), [address, chainId, signer, provider, account, isNetworkModalOpen, closeNetworkModal, checkNetwork]);

    return (
        <Web3Context.Provider value={contextValue}>
            {children}
        </Web3Context.Provider>
    );
};
