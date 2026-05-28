/**
 * MobileTopBar
 *
 * Compact (44px) sticky header for the mobile Task Manager. Replaces the
 * legacy `renderMobileProjectSelector` block in MainLayout which consumed
 * 60-100px of vertical real estate.
 *
 * Left section: a tap target showing the active context (project name with
 * chevron, or an "All Tasks" gradient pill). Tapping triggers the
 * ProjectSwitcherDrawer (caller passes `onOpen`).
 *
 * Right section: the existing ViewSwitcher inline, so the segmented control
 * no longer floats on its own dedicated row.
 */

import { Box, Flex, HStack, Text, Icon } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { FiLayers } from 'react-icons/fi';
import ViewSwitcher from './ViewSwitcher';
import { mobileNavGlassStyle } from './styles/taskBoardStyles';

const MobileTopBar = ({
  variant = 'project',
  projectName,
  onOpen,
  allowBoard = true,
}) => {
  const isAllTasks = variant === 'allTasks';

  return (
    <Box
      sx={mobileNavGlassStyle}
      mx={2}
      mt={1}
      mb={2}
      position="sticky"
      top={0}
      zIndex={5}
    >
      <Flex
        align="center"
        justify="space-between"
        gap={2}
        px={2}
        py={1.5}
        h="44px"
        w="100%"
      >
        {/* Left: context tap-target — opens the project switcher drawer */}
        <Flex
          as="button"
          type="button"
          onClick={onOpen}
          align="center"
          gap={2}
          flex="1"
          minW={0}
          h="100%"
          px={2}
          borderRadius="md"
          _hover={{ bg: 'whiteAlpha.100' }}
          _active={{ bg: 'whiteAlpha.200' }}
          aria-label={isAllTasks ? 'Switch from All Tasks' : `Switch project (${projectName || 'no project'})`}
        >
          {isAllTasks ? (
            <HStack
              spacing={1.5}
              px={2}
              py={0.5}
              borderRadius="full"
              bgGradient="linear(135deg, rgba(159,122,234,0.35) 0%, rgba(66,153,225,0.25) 100%)"
              border="1px solid rgba(159,122,234,0.45)"
            >
              <Icon as={FiLayers} color="whiteAlpha.900" boxSize="12px" />
              <Text
                fontSize="sm"
                fontWeight="700"
                color="white"
                lineHeight="1"
              >
                All Tasks
              </Text>
            </HStack>
          ) : (
            <Text
              fontSize="sm"
              fontWeight="600"
              color="white"
              noOfLines={1}
              flex="1"
              textAlign="left"
            >
              {projectName || 'Select a project'}
            </Text>
          )}
          <ChevronDownIcon color="whiteAlpha.800" boxSize="16px" flexShrink={0} />
        </Flex>

        {/* Right: view switcher (Board / List on mobile; Gantt is hidden) */}
        <Box flexShrink={0}>
          <ViewSwitcher isMobile size="sm" allowBoard={allowBoard} />
        </Box>
      </Flex>
    </Box>
  );
};

export default MobileTopBar;
