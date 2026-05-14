import React from 'react';
import SEOHead from '@/components/common/SEOHead';
import { Box, Container, Spinner, Center, Text } from '@chakra-ui/react';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import { useProtocolData } from '@/hooks/useProtocolData';
import HeroSection from './HeroSection';
import InfrastructureSection from './InfrastructureSection';
import SolidaritySection from './SolidaritySection';
import SponsorshipSection from './SponsorshipSection';
import BeaconSection from './BeaconSection';
import StatsSection from './StatsSection';
import GasUsageSection from './GasUsageSection';

const ProtocolPage = () => {
  const { isLoading, chains, aggregated } = useProtocolData();

  return (
    <>
      <SEOHead
        title="Poa Protocol: Live Transparency Dashboard and Infrastructure"
        description="The open-source infrastructure powering every community-owned organization on poa.box. Live cross-chain state, solidarity fund, gas sponsorship, and protocol upgrade history."
        path="/protocol"
        keywords={[
          "poa protocol",
          "decentralized infrastructure",
          "DAO infrastructure",
          "on-chain transparency",
          "gas sponsorship",
          "solidarity fund",
          "cross-chain DAO",
          "poa.box",
        ]}
      />

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
