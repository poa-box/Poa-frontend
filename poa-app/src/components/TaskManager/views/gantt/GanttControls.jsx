import { HStack, Button, Tooltip } from '@chakra-ui/react';

const ZOOMS = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'all', label: 'All' },
];

const GanttControls = ({ zoom, onZoomChange, onJumpToday }) => (
  <HStack spacing={2}>
    <HStack
      spacing={0}
      bg="rgba(0,0,0,0.35)"
      border="1px solid rgba(255,255,255,0.12)"
      borderRadius="full"
      p="2px"
      role="tablist"
      aria-label="Time zoom"
    >
      {ZOOMS.map((z) => {
        const active = zoom === z.id;
        return (
          <Button
            key={z.id}
            role="tab"
            aria-selected={active}
            size="xs"
            variant="ghost"
            onClick={() => onZoomChange(z.id)}
            bg={active ? 'whiteAlpha.300' : 'transparent'}
            color={active ? 'white' : 'whiteAlpha.700'}
            _hover={{
              bg: active ? 'whiteAlpha.300' : 'whiteAlpha.200',
              color: 'white',
            }}
            borderRadius="full"
            fontWeight={active ? '600' : '500'}
            fontSize="xs"
            px={2.5}
            h="24px"
            minW="auto"
          >
            {z.label}
          </Button>
        );
      })}
    </HStack>

    <Tooltip label="Jump to today" placement="bottom" hasArrow openDelay={400}>
      <Button
        size="xs"
        variant="ghost"
        onClick={onJumpToday}
        color="whiteAlpha.800"
        bg="rgba(0,0,0,0.35)"
        border="1px solid rgba(255,255,255,0.12)"
        borderRadius="full"
        _hover={{ bg: 'whiteAlpha.200', color: 'white' }}
        fontSize="xs"
        px={3}
        h="28px"
      >
        Today
      </Button>
    </Tooltip>
  </HStack>
);

export default GanttControls;
