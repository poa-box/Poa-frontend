import React, { useEffect } from "react";
import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  Box,
  useBreakpointValue,
  useDisclosure,
  Tooltip,
  HStack,
  Text,
  Badge,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerCloseButton,
  DrawerOverlay,
  keyframes,
} from "@chakra-ui/react";
import { useTour } from "@/features/tour";
import {
  VotingEducationContent,
  VotingMobileHeader,
} from "./VotingEducationHeader";

// Breathing animation for official governance indicator
const breathe = keyframes`
  0%, 100% {
    box-shadow: 0 0 6px rgba(237, 137, 54, 0.4);
  }
  50% {
    box-shadow: 0 0 12px rgba(237, 137, 54, 0.7);
  }
`;

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backgroundColor: "rgba(0, 0, 0, .85)",
  boxShadow: "inset 0 0 15px rgba(148, 115, 220, 0.15)",
  border: "1px solid rgba(148, 115, 220, 0.2)",
};

const VotingTabs = ({
  selectedTab,
  handleTabsChange,
  PTVoteType,
  children,
  headerSlot,
}) => {
  // Use responsive sizing based on breakpoints
  const tabFontSize = useBreakpointValue({ base: "md", sm: "xl", md: "2xl" });
  const tabPadding = useBreakpointValue({ base: 2, sm: 2, md: 3 });
  const listPadding = useBreakpointValue({ base: 2, sm: 3, md: 4 });

  // Mobile-only educational drawer
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { currentStepDef, isActive: isTourActive } = useTour();

  // Tour step targeting deep educational content forces the drawer open on mobile
  // so the spotlight can land on the right element.
  useEffect(() => {
    if (isTourActive && currentStepDef?.id === "voting-hybrid-detail" && !isOpen) {
      onOpen();
    }
  }, [isTourActive, currentStepDef?.id, isOpen, onOpen]);

  return (
    <Tabs
      index={selectedTab}
      isFitted
      variant="soft-rounded"
      onChange={handleTabsChange}
      mb={{ base: 4, md: 6 }}
    >
      <Box data-tour="voting-header">
        {headerSlot}
        <VotingMobileHeader
          selectedTab={selectedTab}
          PTVoteType={PTVoteType}
          onInfoClick={onOpen}
        />
      <TabList
        alignItems="center"
        justifyContent="center"
        borderRadius="3xl"
        boxShadow="lg"
        p={listPadding}
        w="100%"
        mx="auto"
        maxW="1440px"
        bg="transparent"
        position="relative"
        display="flex"
        zIndex={0}
        color="rgba(333, 333, 333, 1)"
        spacing={4}
      >
        <Box 
          className="glass" 
          style={glassLayerStyle} 
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          borderRadius="inherit"
          zIndex={-1}
        />
        <Tooltip
          label={PTVoteType === "Hybrid"
            ? "Official governance — binding decisions weighted by membership + contributions"
            : "Official governance — voting power based on your contributions"
          }
          placement="bottom"
          hasArrow
          bg="gray.700"
          openDelay={500}
        >
          <Tab
            fontSize={tabFontSize}
            fontWeight="extrabold"
            color="rgba(333, 333, 333, 1)"
            _selected={{
              backgroundColor: "rgba(237, 137, 54, 0.5)",
              color: "white",
              transform: "translateY(-2px)",
              boxShadow: "0 4px 12px rgba(237, 137, 54, 0.3)"
            }}
            _hover={{
              backgroundColor: "rgba(237, 137, 54, 0.25)"
            }}
            borderRadius="xl"
            py={tabPadding}
            px={{ base: 2, md: 4 }}
            transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
            flex="1"
            minW={0}
          >
            <HStack spacing={2}>
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg="linear-gradient(135deg, #F6AD55 0%, #ED8936 100%)"
                boxShadow="0 0 6px rgba(237, 137, 54, 0.5)"
                animation={`${breathe} 2.5s ease-in-out infinite`}
              />
              <Text>{PTVoteType}</Text>
              <Badge
                fontSize="2xs"
                fontWeight="medium"
                bg="rgba(237, 137, 54, 0.15)"
                color="orange.300"
                border="1px solid rgba(237, 137, 54, 0.3)"
                px={2}
                py={0.5}
                borderRadius="full"
                display={{ base: "none", md: "flex" }}
              >
                Official Governance
              </Badge>
            </HStack>
          </Tab>
        </Tooltip>
        <Tooltip
          label="Informal polling — one person, one vote. Results are non-binding."
          placement="bottom"
          hasArrow
          bg="gray.700"
          openDelay={500}
        >
          <Tab
            fontSize={tabFontSize}
            fontWeight="extrabold"
            color="rgba(333, 333, 333, 1)"
            _selected={{
              backgroundColor: "rgba(66, 153, 225, 0.5)",
              color: "white",
              transform: "translateY(-2px)",
              boxShadow: "0 4px 12px rgba(66, 153, 225, 0.3)"
            }}
            _hover={{
              backgroundColor: "rgba(66, 153, 225, 0.25)"
            }}
            borderRadius="xl"
            py={tabPadding}
            px={{ base: 2, md: 4 }}
            transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
            flex="1"
            minW={0}
          >
            <HStack spacing={2}>
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg="blue.400"
                boxShadow="0 0 6px rgba(66, 153, 225, 0.5)"
              />
              <Text>Democracy</Text>
              <Badge
                fontSize="2xs"
                fontWeight="medium"
                bg="whiteAlpha.100"
                color="gray.400"
                px={2}
                py={0.5}
                borderRadius="full"
                display={{ base: "none", md: "flex" }}
              >
                Informal Poll
              </Badge>
            </HStack>
          </Tab>
        </Tooltip>
      </TabList>
      </Box>

      <TabPanels>
        {children}
      </TabPanels>

      <Drawer isOpen={isOpen} onClose={onClose} placement="bottom">
        <DrawerOverlay bg="blackAlpha.700" />
        <DrawerContent
          bg="rgba(15, 15, 20, 0.98)"
          borderTopRadius="2xl"
          maxH="85vh"
          color="white"
          boxShadow="0 -4px 24px rgba(148, 115, 220, 0.2)"
        >
          <DrawerCloseButton color="gray.400" />
          <DrawerBody py={8} px={5}>
            <VotingEducationContent selectedTab={selectedTab} PTVoteType={PTVoteType} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Tabs>
  );
};

export default VotingTabs; 