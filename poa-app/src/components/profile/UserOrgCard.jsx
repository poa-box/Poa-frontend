import React, { useEffect, useState } from 'react';
import {
  Card,
  CardBody,
  VStack,
  HStack,
  Text,
  Badge,
  Grid,
  Flex,
  Image,
  useColorModeValue,
} from '@chakra-ui/react';
import { useIPFScontext } from '@/context/ipfsContext';
import { formatTokenAmount } from '@/util/formatToken';

const getOrgGradient = (name) => {
  const safe = name || '';
  let hash = 2166136261;
  for (let i = 0; i < safe.length; i++) {
    hash ^= safe.charCodeAt(i);
    hash = (hash * 16777619) | 0;
  }
  const colors = [
    ['#9055E8', '#E85D85'],
    ['#E85D85', '#F06543'],
    ['#6366F1', '#06B6D4'],
    ['#F06543', '#FACC15'],
    ['#7C3AED', '#3B82F6'],
    ['#EC4899', '#F06543'],
    ['#06B6D4', '#9055E8'],
    ['#3B82F6', '#6366F1'],
  ];
  const angles = [135, 150, 120, 160, 140, 125, 155, 130];
  const idx = Math.abs(hash) % colors.length;
  const angle = angles[Math.abs(hash >> 4) % angles.length];
  return `linear-gradient(${angle}deg, ${colors[idx][0]} 0%, ${colors[idx][1]} 100%)`;
};

const formatJoinedDate = (firstSeenAt) => {
  if (!firstSeenAt) return '—';
  const seconds = Number(firstSeenAt);
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
};

const OrgLogo = ({ name, cid, size = '44px' }) => {
  const { safeFetchImageFromIpfs } = useIPFScontext();
  const [blobUrl, setBlobUrl] = useState(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBlobUrl(null);
    setErrored(false);
    if (!cid) return undefined;
    safeFetchImageFromIpfs(cid).then((url) => {
      if (!cancelled && url) setBlobUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [cid, safeFetchImageFromIpfs]);

  const showImage = blobUrl && !errored;
  const safeName = name || '?';

  return (
    <Flex
      w={size}
      h={size}
      borderRadius="lg"
      flexShrink={0}
      align="center"
      justify="center"
      overflow="hidden"
      background={showImage ? 'white' : getOrgGradient(safeName)}
    >
      {showImage ? (
        <Image
          src={blobUrl}
          alt={`${safeName} logo`}
          objectFit="contain"
          maxW="100%"
          maxH="100%"
          onError={() => setErrored(true)}
        />
      ) : (
        <Text
          fontSize="lg"
          fontWeight="700"
          color="white"
          textTransform="uppercase"
          userSelect="none"
        >
          {safeName.charAt(0)}
        </Text>
      )}
    </Flex>
  );
};

const UserOrgCard = ({ userOrg }) => {
  const cardBg = useColorModeValue('white', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const subtextColor = useColorModeValue('gray.600', 'gray.400');

  const org = userOrg.organization || {};
  const name = org.name || 'Unknown';
  const description = org.metadata?.description;
  const logoCid = org.metadata?.logo;
  const tokenSymbol = org.participationToken?.symbol || 'shares';

  return (
    <Card
      variant="outline"
      borderRadius="xl"
      cursor="pointer"
      transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
      _hover={{
        transform: 'translateY(-2px)',
        boxShadow: 'lg',
        borderColor: 'purple.400',
      }}
      bg={cardBg}
      h="100%"
    >
      <CardBody p={4}>
        <VStack align="stretch" spacing={3}>
          <HStack align="center" spacing={3}>
            <OrgLogo name={name} cid={logoCid} />
            <VStack align="stretch" spacing={0} flex={1} minW={0}>
              <HStack justify="space-between" align="center">
                <Text fontWeight="bold" fontSize="lg" color={textColor} noOfLines={1}>
                  {name}
                </Text>
                <Badge colorScheme="green">{userOrg.membershipStatus}</Badge>
              </HStack>
              {description ? (
                <Text fontSize="sm" color={subtextColor} noOfLines={2}>
                  {description}
                </Text>
              ) : null}
            </VStack>
          </HStack>

          <Grid templateColumns="repeat(2, 1fr)" gap={3}>
            <VStack align="start" spacing={0}>
              <Text color={subtextColor} fontSize="xs">Shares Earned</Text>
              <Text color={textColor} fontWeight="medium">
                {formatTokenAmount(userOrg.participationTokenBalance)} {tokenSymbol}
              </Text>
            </VStack>

            <VStack align="start" spacing={0}>
              <Text color={subtextColor} fontSize="xs">Tasks Completed</Text>
              <Text color={textColor} fontWeight="medium">
                {userOrg.totalTasksCompleted || 0}
              </Text>
            </VStack>

            <VStack align="start" spacing={0}>
              <Text color={subtextColor} fontSize="xs">Votes Cast</Text>
              <Text color={textColor} fontWeight="medium">
                {userOrg.totalVotes || 0}
              </Text>
            </VStack>

            <VStack align="start" spacing={0}>
              <Text color={subtextColor} fontSize="xs">Joined</Text>
              <Text color={textColor} fontWeight="medium">
                {formatJoinedDate(userOrg.firstSeenAt)}
              </Text>
            </VStack>
          </Grid>
        </VStack>
      </CardBody>
    </Card>
  );
};

export default UserOrgCard;
