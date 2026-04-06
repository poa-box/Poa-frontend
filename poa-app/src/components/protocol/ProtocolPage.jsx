import React from 'react';
import Head from 'next/head';
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

const ProtocolPage = () => {
  const { isLoading, chains, aggregated } = useProtocolData();

  return (
    <>
      <Head>
        <title>POA Protocol Dashboard</title>
        <meta name="description" content="Real-time transparency dashboard for the POA Protocol — infrastructure, solidarity fund, gas sponsorship, and upgrade history across all chains." />
      </Head>

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
