/**
 * ColumnTabBar
 *
 * Fixed-bottom tab bar for mobile Task Board column navigation. Each
 * tab represents a column (Open / In Progress / Review / Completed)
 * with its current task count, and is underlined in its canonical
 * column color from `util/taskUtils.COLUMN_COLORS` when active.
 *
 * This replaces the redundant top "column name + count + progress bar"
 * stack in TaskBoardMobile (Phase 1 left it in place; Phase 2 swaps it
 * for the bar). Tap is the primary nav; the swipe gesture from
 * `useSwipeNavigation` remains as a power-user shortcut.
 *
 * iOS safe-area: the visible bar height is `TAB_BAR_HEIGHT_PX` plus
 * `env(safe-area-inset-bottom)`, absorbed into `mobileTabBarStyle`'s
 * `paddingBottom` so it can't overlap the iPhone home indicator.
 */

import { Box, Flex, Text } from '@chakra-ui/react';
import { COLUMN_COLORS } from '@/util/taskUtils';
import { mobileTabBarStyle } from './styles/taskBoardStyles';

const ColumnTabBar = ({ taskColumns = [], activeIndex = 0, onSelect }) => {
  if (!taskColumns.length) return null;

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
              onClick={() => onSelect?.(idx)}
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
