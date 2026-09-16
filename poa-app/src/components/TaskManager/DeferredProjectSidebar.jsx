import dynamic from 'next/dynamic';
import { Box, Button, Text } from '@chakra-ui/react';

let sidebarRequest;
function loadSidebar() {
  if (!sidebarRequest) {
    sidebarRequest = import('@/components/TaskManager/ProjectSidebar').catch((error) => {
      sidebarRequest = null;
      throw error;
    });
  }
  return sidebarRequest;
}

function SidebarLoading({ error, retry }) {
  return (
    <Box w="220px" h="calc(100vh - 80px)" flexShrink={0}>
      {error && (
        <Box role="alert" p={4} color="white">
          <Text mb={3}>Projects couldn’t load.</Text>
          <Button size="sm" onClick={retry}>Try again</Button>
        </Box>
      )}
    </Box>
  );
}

export function preloadDesktopTaskSidebar() {
  if (typeof window === 'undefined') return;
  if (!window.matchMedia('(min-width: 48em)').matches) return;
  loadSidebar().catch(() => {});
}

export default dynamic(loadSidebar, { ssr: false, loading: SidebarLoading });
