/**
 * DeveloperInfoSection - Hidden expandable section showing contract addresses
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
  IconButton,
  Collapse,
  useClipboard,
  Tooltip,
  Link,
  Grid,
  GridItem,
} from '@chakra-ui/react';
import {
  FiChevronDown,
  FiChevronRight,
  FiCode,
  FiCopy,
  FiCheck,
  FiExternalLink,
} from 'react-icons/fi';

import { getNetworkByChainId } from '../../config/networks';
import { usePOContext } from '../../context/POContext';

/**
 * Contract labels for display
 */
const CONTRACT_LABELS = {
  executor: 'Executor Contract',
  hybridVoting: 'Hybrid Voting',
  directDemocracyVoting: 'Direct Democracy Voting',
  taskManager: 'Task Manager',
  educationHub: 'Education Hub',
  quickJoin: 'Quick Join',
  participationToken: 'Shares',
};

/**
 * Single contract address row
 */
function ContractRow({ label, address, explorerUrl }) {
  const { hasCopied, onCopy } = useClipboard(address || '');

  if (!address) return null;

  return (
    <Box
      p={3}
      borderRadius="lg"
      bg="white"
      border="1px solid"
      borderColor="warmGray.100"
      transition="border-color 0.2s"
      _hover={{
        borderColor: 'warmGray.300',
      }}
    >
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <VStack align="flex-start" spacing={0} flex={1} minW="150px">
          <Text fontSize="xs" color="warmGray.500">
            {label}
          </Text>
          <Text
            fontFamily="mono"
            fontSize="sm"
            color="warmGray.900"
            wordBreak="break-all"
          >
            {address}
          </Text>
        </VStack>

        <HStack spacing={1}>
          <Tooltip label={hasCopied ? 'Copied!' : 'Copy address'}>
            <IconButton
              icon={hasCopied ? <FiCheck /> : <FiCopy />}
              size="sm"
              variant="ghost"
              colorScheme={hasCopied ? 'green' : 'gray'}
              onClick={onCopy}
              aria-label="Copy address"
            />
          </Tooltip>
          <Tooltip label="View on block explorer">
            <IconButton
              as={Link}
              href={`${explorerUrl}/${address}`}
              isExternal
              icon={<FiExternalLink />}
              size="sm"
              variant="ghost"
              colorScheme="gray"
              aria-label="View on explorer"
            />
          </Tooltip>
        </HStack>
      </HStack>
    </Box>
  );
}

export function DeveloperInfoSection({ contracts = {} }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { orgChainId } = usePOContext();
  const blockExplorerUrl = `${getNetworkByChainId(orgChainId)?.blockExplorer || 'https://sepolia.etherscan.io'}/address`;

  const hasContracts = Object.values(contracts).some(Boolean);

  if (!hasContracts) {
    return null;
  }

  return (
    <Box mt={4}>
      {/* Toggle button */}
      <Box
        as="button"
        width="100%"
        onClick={() => setIsExpanded(!isExpanded)}
        p={4}
        borderRadius="xl"
        bg="warmGray.50"
        border="1px solid"
        borderColor="warmGray.200"
        textAlign="left"
        transition="background-color 0.2s"
        _hover={{
          bg: 'warmGray.100',
        }}
      >
        <HStack justify="space-between">
          <HStack spacing={3}>
            <Icon as={FiCode} color="warmGray.400" />
            <Text color="warmGray.600" fontWeight="medium">
              Developer Info
            </Text>
          </HStack>
          <Icon
            as={isExpanded ? FiChevronDown : FiChevronRight}
            color="warmGray.400"
            transition="transform 0.2s"
          />
        </HStack>
      </Box>

      {/* Expandable content */}
      <Collapse in={isExpanded} animateOpacity>
        <Box
          bg="rgba(255, 255, 255, 0.8)"
          border="1px solid"
          borderColor="warmGray.200"
          borderRadius="2xl"
          p={{ base: 4, md: 6 }}
          mt={2}
          boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
        >
          <VStack align="stretch" spacing={4}>
            <HStack spacing={2}>
              <Icon as={FiCode} color="amethyst.500" />
              <Text fontWeight="semibold" color="warmGray.900">
                Smart Contract Addresses
              </Text>
            </HStack>

            <Text fontSize="sm" color="warmGray.600">
              These are the deployed smart contracts for this organization.
              You can verify them on the block explorer.
            </Text>

            <Grid
              templateColumns={{ base: '1fr', lg: 'repeat(2, 1fr)' }}
              gap={3}
            >
              {Object.entries(CONTRACT_LABELS).map(([key, label]) => {
                const address = contracts[key];
                if (!address) return null;
                return (
                  <GridItem key={key}>
                    <ContractRow label={label} address={address} explorerUrl={blockExplorerUrl} />
                  </GridItem>
                );
              })}
            </Grid>
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default DeveloperInfoSection;
