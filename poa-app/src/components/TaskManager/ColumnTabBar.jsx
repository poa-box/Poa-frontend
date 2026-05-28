// Fixed-bottom tab bar for the mobile Task Board: one tab per column
// with its task count, underlined in COLUMN_COLORS when active.
// iOS safe-area inset is baked into mobileTabBarStyle's paddingBottom.

import { Box, Flex, Text } from '@chakra-ui/react';
import { COLUMN_COLORS } from '@/util/taskUtils';
import { mobileTabBarStyle } from './styles/taskBoardStyles';

const ColumnTabBar = ({ taskColumns, activeIndex, onSelect }) => {
  if (!taskColumns?.length) return null;

  return (
    <Box
      sx={mobileTabBarStyle}
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      zIndex={20}
      role="tablist"
      aria-label="Task board columns"
    >
      <Flex align="stretch" justify="space-between">
        {taskColumns.map((col, idx) => {
          const isActive = idx === activeIndex;
          const accent = COLUMN_COLORS[col.id] || '#9F7AEA';
          const count = col.tasks?.length || 0;
          return (
            <Box
              key={col.id}
              as="button"
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`${col.title} (${count})`}
              onClick={() => onSelect(idx)}
              flex="1"
              minW={0}
              py={1.5}
              px={1}
              position="relative"
              bg="transparent"
              transition="background 0.15s ease"
              _active={{ bg: 'whiteAlpha.100' }}
              _hover={{ bg: 'whiteAlpha.50' }}
              _focusVisible={{
                outline: 'none',
                boxShadow: 'inset 0 0 0 2px rgba(159, 122, 234, 0.7)',
              }}
            >
              <Flex direction="column" align="center" gap={0.5}>
                <Flex align="center" gap={1.5}>
                  <Text
                    fontSize="0.72rem"
                    fontWeight={isActive ? '700' : '500'}
                    color={isActive ? 'white' : 'whiteAlpha.600'}
                    noOfLines={1}
                    textAlign="center"
                  >
                    {col.title}
                  </Text>
                  {count > 0 && (
                    <Box
                      bg={isActive ? accent : 'whiteAlpha.200'}
                      color={isActive ? 'gray.900' : 'whiteAlpha.700'}
                      fontSize="0.6rem"
                      fontWeight="700"
                      px={1.5}
                      borderRadius="full"
                      minW="18px"
                      lineHeight="14px"
                      textAlign="center"
                    >
                      {count}
                    </Box>
                  )}
                </Flex>
                {/* Active underline — column-color cue */}
                <Box
                  w="60%"
                  h="3px"
                  borderRadius="full"
                  bg={isActive ? accent : 'transparent'}
                  transition="background 0.15s ease"
                />
              </Flex>
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
};

export default ColumnTabBar;
