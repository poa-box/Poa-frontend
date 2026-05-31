// Mobile-only section wheel for the org NavBar. Replaces the old centered
// PoA logo with a "you are here" indicator: the current section sits centered
// and emphasized, the previous/next sections peek in from the left/right and
// fade out at the edges (mask), signalling that you can swipe between them.
//
// The URL is the source of truth for which section is active (router.pathname),
// so swiping/tapping just router.push()es to a sibling section — no internal
// index to drift out of sync across page navigations. On pages that aren't in
// the wheel (profile, home, settings, …) it falls back to a neutral org label.

import { useCallback, useMemo } from 'react';
import { Box, Flex, Link, Text } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe';

// Matches the active-row accent already used in the NavBar drawer.
const ACTIVE_ACCENT = '#65B891';

// First path segment, ignoring any query string (mirrors NavBar's isActive).
const sectionKey = (path) => '/' + ((path || '').split('?')[0].split('/')[1] || '');

const PeekLink = ({ section, align }) => (
  <Box flex="1" minW={0} textAlign={align}>
    {section && (
      <Link
        as={NextLink}
        href={section.path}
        prefetch={false}
        display="block"
        _hover={{ textDecoration: 'none' }}
      >
        <Text
          as="span"
          display="block"
          fontSize="xs"
          fontWeight="500"
          color="whiteAlpha.500"
          noOfLines={1}
          _hover={{ color: 'whiteAlpha.700' }}
        >
          {section.name}
        </Text>
      </Link>
    )}
  </Box>
);

const MobileSectionWheel = ({ sections = [] }) => {
  const router = useRouter();
  const org = useOrgName();

  const currentIndex = useMemo(() => {
    const current = '/' + (router.pathname.split('/')[1] || '');
    return sections.findIndex((s) => sectionKey(s.path) === current);
  }, [router.pathname, sections]);

  const goTo = useCallback(
    (index) => {
      if (index < 0 || index >= sections.length || index === currentIndex) return;
      router.push(sections[index].path);
    },
    [router, sections, currentIndex]
  );

  const { touchHandlers } = useHorizontalSwipe({
    onSwipeLeft: () => goTo(currentIndex + 1),
    onSwipeRight: () => goTo(currentIndex - 1),
  });

  // Not on a wheel section — show a neutral, honest org label (no logo, no
  // misleading active highlight). The hamburger still provides full nav here.
  if (currentIndex === -1) {
    return (
      <Flex
        flex="1"
        minW={0}
        h="100%"
        align="center"
        justify="center"
        display={{ base: 'flex', md: 'none' }}
      >
        <Text fontSize="sm" fontWeight="600" color="whiteAlpha.800" noOfLines={1} px={2}>
          {org}
        </Text>
      </Flex>
    );
  }

  const prev = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const next = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null;
  const current = sections[currentIndex];

  return (
    <Flex
      flex="1"
      minW={0}
      h="100%"
      align="center"
      justify="center"
      position="relative"
      display={{ base: 'flex', md: 'none' }}
      role="navigation"
      aria-label="Org sections"
      {...touchHandlers}
      style={{ touchAction: 'pan-y' }}
      sx={{
        // Fade the peeking neighbours out toward the home icon / hamburger
        // instead of hard-clipping them. Mask only — no backdrop-filter.
        maskImage:
          'linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%)',
      }}
    >
      <Flex align="center" justify="center" w="100%" minW={0} gap={2}>
        <PeekLink section={prev} align="right" />

        {/* Current section — centered, emphasized, accent underline. */}
        <Flex direction="column" align="center" flexShrink={0} maxW="62%" gap="2px">
          <Flex align="center" gap={1} maxW="100%">
            <ChevronLeftIcon boxSize={3} color={prev ? 'whiteAlpha.500' : 'transparent'} aria-hidden />
            <Text fontSize="sm" fontWeight="700" color="white" noOfLines={1} aria-current="page">
              {current.name}
            </Text>
            <ChevronRightIcon boxSize={3} color={next ? 'whiteAlpha.500' : 'transparent'} aria-hidden />
          </Flex>
          <Box h="2px" w="70%" borderRadius="full" bg={ACTIVE_ACCENT} />
        </Flex>

        <PeekLink section={next} align="left" />
      </Flex>
    </Flex>
  );
};

export default MobileSectionWheel;
