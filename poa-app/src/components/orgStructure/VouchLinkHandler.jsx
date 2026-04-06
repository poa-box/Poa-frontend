/**
 * VouchLinkHandler
 * Rendered when an existing member clicks a vouch link.
 * Shows vouch confirmation card with progress and vouch button.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  VStack,
  Text,
  Button,
  Card,
  CardBody,
  Heading,
  Icon,
  Badge,
  HStack,
  useColorModeValue,
  Alert,
  AlertIcon,
  Box,
} from '@chakra-ui/react';
import { FaCheck, FaHandshake, FaArrowRight } from 'react-icons/fa';
import { useRouter } from 'next/router';
import { VouchProgressBar } from './VouchProgressBar';
import apolloClient from '../../util/apolloClient';
import { FETCH_USERNAME_NEW } from '../../util/queries';

/**
 * @param {Object} props
 * @param {string} props.vouchAddress - Address to vouch for
 * @param {string} props.hatId - Hat ID for the role
 * @param {string} props.userDAO - Org name
 * @param {Array} props.roles - Roles with vouching from useOrgStructure
 * @param {Function} props.vouchFor - vouchFor function from useClaimRole
 * @param {boolean} props.isVouching - Whether a vouch tx is in progress
 * @param {boolean} props.hasAlreadyVouched - Whether current user already vouched
 * @param {Object} props.vouchProgress - { current, quorum, isComplete }
 */
export function VouchLinkHandler({
  vouchAddress,
  hatId,
  userDAO,
  roles,
  vouchFor,
  isVouching,
  hasAlreadyVouched,
  vouchProgress,
}) {
  const router = useRouter();
  const [vouchSubmitted, setVouchSubmitted] = useState(false);
  const [username, setUsername] = useState(null);

  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.9)', 'rgba(0, 0, 0, 0.6)');
  const textColor = useColorModeValue('gray.800', 'white');
  const subtextColor = useColorModeValue('gray.600', 'gray.300');

  const roleName = useMemo(() => {
    const role = roles?.find(r => String(r.hatId) === String(hatId));
    return role?.name || 'Unknown Role';
  }, [roles, hatId]);

  const truncatedAddress = vouchAddress
    ? `${vouchAddress.substring(0, 6)}...${vouchAddress.substring(vouchAddress.length - 4)}`
    : '';

  // Look up username for the vouch address
  useEffect(() => {
    if (!vouchAddress) return;
    apolloClient.query({
      query: FETCH_USERNAME_NEW,
      variables: { id: vouchAddress.toLowerCase() },
      fetchPolicy: 'cache-first',
    }).then(({ data }) => {
      const name = data?.account?.username;
      if (name && name.trim().length > 0) setUsername(name);
    }).catch((err) => {
      console.warn('[VouchLinkHandler] Username lookup failed:', err);
    });
  }, [vouchAddress]);

  const handleVouch = async () => {
    const result = await vouchFor(vouchAddress, hatId);
    if (result?.success) {
      setVouchSubmitted(true);
    }
  };

  const handleGoToDashboard = () => {
    router.push(`/profileHub/?userDAO=${userDAO}`);
  };

  return (
    <VStack spacing={6} align="stretch">
      <Card bg={cardBg} borderRadius="xl" boxShadow="xl" borderWidth="1px" borderColor="rgba(255,255,255,0.1)">
        <CardBody p={{ base: 5, md: 8 }}>
          <VStack spacing={5} align="stretch">
            <Box textAlign="center">
              <Icon as={FaHandshake} color="teal.400" boxSize={{ base: 10, md: 12 }} mb={3} />
              <Heading size={{ base: "md", md: "lg" }} color={textColor} mb={2}>
                Vouch for a New Member
              </Heading>
              <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                Someone wants to join <b>{userDAO}</b> and needs your vouch.
              </Text>
            </Box>

            <HStack spacing={3} justify="center" flexWrap="wrap">
              <Badge colorScheme="teal" fontSize="sm" px={3} py={1} borderRadius="md">
                {roleName}
              </Badge>
              <Badge colorScheme="gray" fontSize="sm" px={3} py={1} borderRadius="md" fontFamily={username ? 'inherit' : 'mono'}>
                {username || truncatedAddress}
              </Badge>
            </HStack>

            {vouchProgress && (
              <Box px={2}>
                <VouchProgressBar
                  current={vouchProgress.current}
                  quorum={vouchProgress.quorum}
                  size="md"
                />
              </Box>
            )}

            {vouchSubmitted || hasAlreadyVouched ? (
              <VStack spacing={3}>
                <Alert status="success" borderRadius="md">
                  <AlertIcon />
                  <Text fontSize="sm">
                    {vouchSubmitted ? 'Vouch submitted successfully!' : 'You have already vouched for this person.'}
                  </Text>
                </Alert>
                <Button
                  colorScheme="teal"
                  variant="outline"
                  width="100%"
                  onClick={handleGoToDashboard}
                  rightIcon={<FaArrowRight />}
                >
                  Return to Dashboard
                </Button>
              </VStack>
            ) : vouchProgress?.isComplete ? (
              <VStack spacing={3}>
                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  <Text fontSize="sm">
                    Vouch quorum has been reached. This person can now complete their onboarding.
                  </Text>
                </Alert>
                <Button
                  colorScheme="teal"
                  variant="outline"
                  width="100%"
                  onClick={handleGoToDashboard}
                  rightIcon={<FaArrowRight />}
                >
                  Return to Dashboard
                </Button>
              </VStack>
            ) : (
              <Button
                colorScheme="teal"
                size="lg"
                width="100%"
                onClick={handleVouch}
                isLoading={isVouching}
                loadingText="Submitting Vouch..."
                leftIcon={<FaCheck />}
              >
                Vouch for this Person
              </Button>
            )}
          </VStack>
        </CardBody>
      </Card>
    </VStack>
  );
}

export default VouchLinkHandler;
