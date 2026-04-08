/**
 * ProjectHeader
 * Header bar showing project name with sidebar toggle and project info
 */

import {
  Box,
  Flex,
  Text,
  IconButton,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  VStack,
  HStack,
  Image,
  Link,
} from '@chakra-ui/react';
import { InfoIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { FaProjectDiagram } from 'react-icons/fa';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backgroundColor: "rgba(33, 33, 33, 0.97)",
};

const ProjectHeader = ({ projectName, sidebarVisible, toggleSidebar }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { selectedProject } = useDataBaseContext();

  // Use indexed description from subgraph (no IPFS fetching needed)
  const projectDescription = selectedProject?.description || '';
  // Format budget from wei (18 decimals) to human-readable, 0 means no budget
  const projectBudget = formatTokenAmount(selectedProject?.cap || '0');

  return (
    <>
      <Box
        bg="purple.300"
        w="100%"
        p={2}
        height="auto"
      >
        <Flex align="center" justify="space-between" h="100%">
          <Flex align="center" h="100%">
            {!sidebarVisible && (
              <Tooltip label="Show projects sidebar" placement="right" hasArrow>
                <IconButton
                  aria-label="Show projects sidebar"
                  icon={<FaProjectDiagram size="16px" />}
                  size="sm"
                  variant="ghost"
                  colorScheme="blackAlpha"
                  mr={2}
                  onClick={toggleSidebar}
                  _hover={{
                    bg: "blackAlpha.200",
                    transform: "scale(1.1)"
                  }}
                  transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                />
              </Tooltip>
            )}
            <Text
              fontSize="2xl"
              fontWeight="bold"
              color="black"
              lineHeight="normal"
            >
              {projectName}
            </Text>
            <Tooltip label="View project info" placement="right" hasArrow>
              <IconButton
                aria-label="View project info"
                icon={<InfoIcon />}
                size="sm"
                variant="ghost"
                colorScheme="blackAlpha"
                ml={2}
                onClick={onOpen}
                _hover={{
                  bg: "blackAlpha.200",
                  transform: "scale(1.1)"
                }}
                transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
              />
            </Tooltip>
          </Flex>
        </Flex>
      </Box>

      {/* Project Info Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent bg="transparent" textColor="white">
          <div style={glassLayerStyle} />
          <ModalHeader borderTopRadius="md">{projectName}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack align="start" spacing={4}>
              <Box w="100%">
                <Text fontWeight="bold" mb={2} color="gray.300">
                  Description
                </Text>
                {projectDescription ? (
                  <Text style={{ whiteSpace: 'pre-wrap' }} lineHeight="1.6">
                    {projectDescription}
                  </Text>
                ) : (
                  <Text color="gray.400" fontStyle="italic">
                    No description available for this project.
                  </Text>
                )}
              </Box>
              <Box w="100%">
                <Text fontWeight="bold" mb={2} color="gray.300">
                  Budget
                </Text>
                {projectBudget !== '0' ? (
                  <Text>
                    {projectBudget} shares
                  </Text>
                ) : (
                  <Text color="gray.400" fontStyle="italic">
                    No share budget
                  </Text>
                )}
                {(selectedProject?.bountyCaps || []).length > 0 && (
                  <VStack align="start" spacing={2} mt={3}>
                    <Text fontWeight="bold" fontSize="sm" color="gray.300">
                      Bounty Token Budgets
                    </Text>
                    {selectedProject.bountyCaps.map((bc) => {
                      const tokenInfo = getTokenByAddress(bc.token);
                      // Caps at or above 10^30 are effectively unlimited (contract uses 2^128-1)
                      const isUnlimited = bc.cap && bc.cap.length > 30;
                      const formattedCap = isUnlimited ? 'Unlimited' : formatTokenAmount(bc.cap || '0', tokenInfo.decimals, 2);
                      return (
                        <HStack key={bc.token} spacing={2} align="center">
                          {tokenInfo.logo ? (
                            <Image src={tokenInfo.logo} alt={tokenInfo.symbol} boxSize="20px" borderRadius="full" fallback={<></>} />
                          ) : (
                            <Box w="20px" h="20px" borderRadius="full" bg="gray.500" display="flex" alignItems="center" justifyContent="center">
                              <Text fontSize="xs" fontWeight="bold" color="white">{tokenInfo.symbol.charAt(0)}</Text>
                            </Box>
                          )}
                          <Text fontSize="sm">
                            {tokenInfo.symbol}: {formattedCap}
                          </Text>
                          {tokenInfo.projectUrl && (
                            <Link href={tokenInfo.projectUrl} isExternal onClick={(e) => e.stopPropagation()}>
                              <ExternalLinkIcon boxSize={3} color="gray.500" _hover={{ color: 'gray.300' }} />
                            </Link>
                          )}
                        </HStack>
                      );
                    })}
                  </VStack>
                )}
              </Box>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ProjectHeader;
