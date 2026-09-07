import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Box, Button, Text } from '@chakra-ui/react';
import { useWeb3Context } from '@/context/web3Context';
import { useAutoChainSwitch } from '@/hooks/useAutoChainSwitch';

function NetworkDialogLoading({ error, retry, pastDelay }) {
    const { isNetworkModalOpen, closeNetworkModal } = useWeb3Context();
    useEffect(() => {
        if (!isNetworkModalOpen) return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') closeNetworkModal();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isNetworkModalOpen, closeNetworkModal]);
    // Respect Next's pending delay without delaying errors or Escape handling.
    if (!isNetworkModalOpen || (!error && !pastDelay)) return null;
    return (
        <Box position="fixed" bottom={4} right={4} maxW="calc(100vw - 32px)"
            bg="white" color="warmGray.800" borderRadius="lg" boxShadow="lg" p={4} zIndex="toast">
            <Text role={error ? 'alert' : 'status'} mb={3}>
                {error ? 'Network options couldn’t load.' : 'Opening network options…'}
            </Text>
            {error && <Button size="sm" mr={2} onClick={retry}>Try again</Button>}
            <Button size="sm" variant="ghost" onClick={closeNetworkModal}>Close</Button>
        </Box>
    );
}

const NetworkSwitchModal = dynamic(() => import('@/components/NetworkSwitchModal'), {
    ssr: false,
    loading: NetworkDialogLoading,
});

const NetworkModalControl = () => {
    const { isNetworkModalOpen, closeNetworkModal } = useWeb3Context();

    // Auto-switch wallet to the org's chain when navigating to an org
    useAutoChainSwitch();

    return isNetworkModalOpen
        ? <NetworkSwitchModal isOpen={isNetworkModalOpen} onClose={closeNetworkModal} />
        : null;
};

export default NetworkModalControl;
