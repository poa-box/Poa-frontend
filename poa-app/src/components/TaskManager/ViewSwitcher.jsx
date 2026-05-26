import { useEffect, useRef } from 'react';
import { HStack, Button, useToast } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useViewMode } from './views/useViewMode';

const MODES = [
  { id: 'board', label: 'Board' },
  { id: 'list', label: 'List' },
  { id: 'gantt', label: 'Gantt' },
];

const ViewSwitcher = ({ isMobile = false, size = 'sm' }) => {
  const allowGantt = !isMobile;
  const { viewMode, setViewMode } = useViewMode({ allowGantt });
  const router = useRouter();
  const toast = useToast();
  const fallbackToastShown = useRef(false);

  // If the URL explicitly asks for gantt but we're on mobile, fall back to
  // list and tell the user once (so a shared link doesn't silently swap).
  useEffect(() => {
    if (isMobile && router.query.view === 'gantt' && !fallbackToastShown.current) {
      fallbackToastShown.current = true;
      setViewMode('list');
      toast({
        title: 'Gantt view requires a larger screen',
        description: 'Showing the List view instead.',
        status: 'info',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
    }
  }, [isMobile, router.query.view, setViewMode, toast]);

  const visibleModes = allowGantt ? MODES : MODES.filter((m) => m.id !== 'gantt');

  return (
    <HStack
      role="tablist"
      aria-label="Task view mode"
      spacing={0}
      bg="rgba(0,0,0,0.35)"
      border="1px solid rgba(255,255,255,0.12)"
      borderRadius="full"
      p="2px"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const idx = visibleModes.findIndex((m) => m.id === viewMode);
        const next =
          e.key === 'ArrowRight'
            ? visibleModes[(idx + 1) % visibleModes.length]
            : visibleModes[(idx - 1 + visibleModes.length) % visibleModes.length];
        setViewMode(next.id);
      }}
    >
      {visibleModes.map((m) => {
        const active = viewMode === m.id;
        return (
          <Button
            key={m.id}
            role="tab"
            aria-selected={active}
            size={size}
            variant="ghost"
            onClick={() => setViewMode(m.id)}
            bg={active ? 'whiteAlpha.300' : 'transparent'}
            color={active ? 'white' : 'whiteAlpha.700'}
            _hover={{
              bg: active ? 'whiteAlpha.300' : 'whiteAlpha.200',
              color: 'white',
            }}
            _focusVisible={{
              boxShadow: '0 0 0 2px rgba(159,122,234,0.7)',
            }}
            borderRadius="full"
            fontWeight={active ? '600' : '500'}
            fontSize="xs"
            px={3}
            h="26px"
            minW="auto"
            transition="background 0.15s ease, color 0.15s ease"
          >
            {m.label}
          </Button>
        );
      })}
    </HStack>
  );
};

export default ViewSwitcher;
