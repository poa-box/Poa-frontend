import React from 'react';
import { useWeb3Context } from '@/context/web3Context';
import NetworkSwitchModal  from '@/components/NetworkSwitchModal';
import { useAutoChainSwitch } from '@/hooks/useAutoChainSwitch';

const NetworkModalControl = () => {
    const { isNetworkModalOpen, closeNetworkModal } = useWeb3Context();

    // Auto-switch wallet to the org's chain when navigating to an org
    useAutoChainSwitch();

    return (
        <NetworkSwitchModal isOpen={isNetworkModalOpen} onClose={closeNetworkModal} />
    );
};

export default NetworkModalControl;
