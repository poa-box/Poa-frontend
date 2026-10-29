import React, { useRef } from 'react';
import MainLayout from '@/components/TaskManager/MainLayout';
import { Box, Center, VStack, Text, Button } from '@chakra-ui/react';
import CommunityLoadingState from "@/components/shared/CommunityLoadingState";
import { useProjectContext } from '@/context/ProjectContext';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from '@/context/POContext';
import { useOrgTheme } from '@/hooks/useOrgTheme';
import { useTaskRoute } from '@/hooks/useTaskRoute';
import { preloadInitialTaskView } from '@/components/TaskManager/views/lazyTaskViews';
import { preloadDesktopTaskSidebar } from '@/components/TaskManager/DeferredProjectSidebar';
import { useOrgGate } from "@/components/shared/OrgDeadEnd";

// The route already has a retryable feature boundary. Keep its layout in that
// same chunk and preload only the selected view while accounts initialize.
if (typeof window !== 'undefined') {
  preloadInitialTaskView();
  preloadDesktopTaskSidebar();
}

const TaskWorkspace = () => {
  useTaskRoute();
  const { projectsLoading, projectsError, projectsData, refetchProjects } = useProjectContext();
  const { poContextLoading } = usePOContext();
  const { pageBackground } = useOrgTheme();
  const orgGate = useOrgGate();
  const containerRef = useRef();

  // No org to render: a dead end, not a pending state. After every hook.
  if (orgGate) return orgGate;
  return (
    <>
      <Navbar />
      {poContextLoading || projectsLoading ? (
        <Center minH="90vh" background={pageBackground()}>
          <CommunityLoadingState label="Loading your task board…" />
        </Center>
      ) : projectsError && !projectsData?.length ? (
        <Center minH="90vh" background={pageBackground()}>
          <VStack spacing={4} px={5}>
            <Text>Projects could not finish loading. Please try again.</Text>
            <Button onClick={() => refetchProjects()}>Try again</Button>
          </VStack>
        </Center>
      ) : (
        <Box minH="90vh" position="relative" bg="blackAlpha.600" ref={containerRef} background={pageBackground()}>
          <MainLayout />
        </Box>
      )}
    </>
  );
};

export default TaskWorkspace;
