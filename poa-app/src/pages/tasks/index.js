import React, { useRef, useEffect } from 'react';
import { Box, Spinner, Center } from '@chakra-ui/react';
import MainLayout from '../../components/TaskManager/MainLayout';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useRouter } from 'next/router';
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { usePOContext } from '@/context/POContext';
import { useOrgTheme } from '@/hooks';

const Tasks = () => {
  const router = useRouter();
  const { userDAO } = router.query;
  const { setSelectedProjectId, projects } = useDataBaseContext();
  const { poContextLoading } = usePOContext();
  const { pageBackground } = useOrgTheme();
  const containerRef = useRef();

  useEffect(() => {
    if (router.query.projectId !== undefined) {
      const rawProjectId = decodeURIComponent(router.query.projectId); // Decode the query parameter
      console.log("Decoded projectId from query:", rawProjectId);
      setSelectedProjectId(rawProjectId);
    }
    else if (projects && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [router.query.projectId, projects]);

  return (
    <>
      <Navbar />
      {poContextLoading ? (
        <Center height="90vh" background={pageBackground("blackAlpha.600")}>
          <Spinner size="xl" />
        </Center>
      ) : (
        <Box minH="90vh" position="relative" background={pageBackground("blackAlpha.600")} ref={containerRef}>
          <MainLayout />
        </Box>
      )}
    </>
  );
};

export default Tasks;
