import React, { useRef, useState } from 'react';
import { Box, Button, Spinner, Center, Text } from '@chakra-ui/react';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { useProtocolData } from '@/hooks/useProtocolData';
import HeroSection from '@/components/protocol/HeroSection';
import InfrastructureSection from '@/components/protocol/InfrastructureSection';
import SolidaritySection from '@/components/protocol/SolidaritySection';
import SponsorshipSection from '@/components/protocol/SponsorshipSection';
import BeaconSection from '@/components/protocol/BeaconSection';
import StatsSection from '@/components/protocol/StatsSection';
import GasUsageSection from '@/components/protocol/GasUsageSection';

const ProtocolPage = () => {
  const { isLoading, chains, aggregated, unavailableChains, refetch } = useProtocolData();
  const [isRetrying, setIsRetrying] = useState(false);
  const retryInFlight = useRef(false);
  const retry = async () => {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setIsRetrying(true);
    try { await refetch(); }
    finally { retryInFlight.current = false; setIsRetrying(false); }
  };

  return (
    <>


      <Box minH="100vh" bg="white">
        <Navbar />

        <HeroSection aggregated={aggregated} isLoading={isLoading} />

        {isLoading ? (
          <Center py={20}>
            <Spinner size="xl" color="amethyst.500" />
            <Text ml={4} color="warmGray.500">Loading protocol data...</Text>
          </Center>
        ) : (
          <>
            {unavailableChains.length > 0 && <Box role="status" textAlign="center" py={4} color="warmGray.600">
              <Text>Some networks are unavailable. Totals will appear when every source responds.</Text>
              <Button mt={3} size="sm" onClick={retry} isLoading={isRetrying} isDisabled={isRetrying} loadingText="Trying again">Try again</Button>
            </Box>}
            <StatsSection chains={chains} aggregated={aggregated} />
            <GasUsageSection chains={chains} />
            <InfrastructureSection chains={chains} />
            <SolidaritySection chains={chains} />
            <SponsorshipSection chains={chains} />
            <BeaconSection chains={chains} />
          </>
        )}

        <Footer />
      </Box>
    </>
  );
};

export default ProtocolPage;
