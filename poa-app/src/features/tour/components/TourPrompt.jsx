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
        bg="white"
        borderRadius="2xl"
        boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
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
              bg="amethyst.50"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Icon as={PiMapTrifold} boxSize={10} color="amethyst.500" />
            </Box>

            {/* Title */}
            <VStack spacing={2}>
              <HStack spacing={2}>
                <Icon as={PiSparkle} color="amethyst.400" boxSize={5} />
                <Heading size="lg" color="warmGray.800">
                  Welcome to {orgName}!
                </Heading>
                <Icon as={PiSparkle} color="amethyst.400" boxSize={5} />
              </HStack>
              <Text color="warmGray.600" fontSize="md" maxW="340px">
                Get a quick walkthrough of your new organization, then create your first project and task.
              </Text>
            </VStack>

            {/* What you'll learn */}
            <Box
              bg="warmGray.50"
              borderRadius="xl"
              p={4}
              w="100%"
            >
              <VStack spacing={2} align="start">
                <HStack spacing={2}>
                  <Icon as={PiRocketLaunch} color="amethyst.500" boxSize={4} />
                  <Text fontSize="sm" color="warmGray.700">
                    See how your dashboard, task board, voting, and roles work
                  </Text>
                </HStack>
                <HStack spacing={2}>
                  <Icon as={PiRocketLaunch} color="amethyst.500" boxSize={4} />
                  <Text fontSize="sm" color="warmGray.700">
                    Set up your first project and publish a task for members to claim
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
                _hover={{ bg: 'amethyst.600', transform: 'translateY(-2px)' }}
                transition="all 0.2s"
                onClick={() => startTour(orgName)}
              >
                Start Tour
              </Button>
              <Button
                size="md"
                variant="ghost"
                color="warmGray.500"
                _hover={{ color: 'warmGray.700' }}
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
