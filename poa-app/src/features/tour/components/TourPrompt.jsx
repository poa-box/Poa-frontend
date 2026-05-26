import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Icon,
  Box,
} from '@chakra-ui/react';
import { PiSparkle, PiRocketLaunch, PiMapTrifold } from 'react-icons/pi';
import { useTour } from '../TourContext';

export default function TourPrompt() {
  const { showPromptModal, orgName, startTour, dismissPrompt } = useTour();

  return (
    <Modal
      isOpen={showPromptModal}
      onClose={dismissPrompt}
      isCentered
      size="md"
      motionPreset="slideInBottom"
    >
      <ModalOverlay bg="rgba(0, 0, 0, 0.6)" />
      <ModalContent
        bg="rgba(24, 24, 27, 0.97)"
        borderRadius="2xl"
        boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.06)"
        mx={4}
        overflow="hidden"
      >
        <ModalBody p={0}>
          {/* Top accent bar */}
          <Box h="4px" bgGradient="linear(to-r, amethyst.400, coral.400)" />

          <VStack spacing={5} p={8} textAlign="center">
            {/* Icon */}
            <Box
              w="80px"
              h="80px"
              borderRadius="2xl"
              bgGradient="linear(to-br, amethyst.400, amethyst.600)"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Icon as={PiMapTrifold} boxSize={10} color="white" />
            </Box>

            {/* Title */}
            <VStack spacing={2}>
              <HStack spacing={2}>
                <Icon as={PiSparkle} color="amethyst.300" boxSize={5} />
                <Heading size="lg" color="white">
                  Welcome to {orgName}!
                </Heading>
                <Icon as={PiSparkle} color="amethyst.300" boxSize={5} />
              </HStack>
              <Text color="whiteAlpha.700" fontSize="md" maxW="340px">
                Get a quick walkthrough of this organization and see how everything works.
              </Text>
            </VStack>

            {/* What you'll learn */}
            <Box
              bg="whiteAlpha.50"
              border="1px solid"
              borderColor="whiteAlpha.100"
              borderRadius="xl"
              p={4}
              w="100%"
            >
              <VStack spacing={2} align="start">
                <HStack spacing={2}>
                  <Icon as={PiRocketLaunch} color="amethyst.300" boxSize={4} />
                  <Text fontSize="sm" color="whiteAlpha.800">
                    Explore the dashboard, task board, voting, and roles
                  </Text>
                </HStack>
                <HStack spacing={2}>
                  <Icon as={PiRocketLaunch} color="amethyst.300" boxSize={4} />
                  <Text fontSize="sm" color="whiteAlpha.800">
                    Learn how tasks, governance, and permissions work
                  </Text>
                </HStack>
              </VStack>
            </Box>

            {/* Buttons */}
            <VStack spacing={2} w="100%">
              <Button
                size="lg"
                w="100%"
                bg="amethyst.500"
                color="white"
                _hover={{ bg: 'amethyst.400', transform: 'translateY(-2px)' }}
                transition="all 0.2s"
                onClick={() => startTour(orgName)}
              >
                Start Tour
              </Button>
              <Button
                size="md"
                variant="ghost"
                color="whiteAlpha.500"
                _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                onClick={dismissPrompt}
              >
                Maybe Later
              </Button>
            </VStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
