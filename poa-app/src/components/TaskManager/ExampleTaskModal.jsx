import { Box, Text, Button, VStack, HStack, Badge, Modal, ModalOverlay, ModalContent, ModalCloseButton, ModalBody, ModalFooter, Spacer } from '@chakra-ui/react';

// --- Example task detail modal shown during tour ---

const modalGlassStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(33, 33, 33, 0.97)',
};

export default function ExampleTaskModal({ isOpen, onClose, tokenLabel }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered zIndex={10001}>
      <ModalOverlay bg="transparent" />
      <ModalContent bg="transparent" textColor="white" data-tour="example-task-modal">
        <div style={modalGlassStyle} />
        <ModalCloseButton zIndex={1} />
        <Box pt={4} borderTopRadius="2xl" bg="transparent" boxShadow="lg" position="relative">
          <div style={modalGlassStyle} />
          <Text ml="6" fontSize="2xl" fontWeight="bold">Design the org logo</Text>
        </Box>
        <ModalBody>
          <VStack spacing={4} align="start">
            <Box>
              <Text mb="4" mt="4" lineHeight="6" fontSize="md" fontWeight="bold" style={{ whiteSpace: 'pre-wrap' }}>
                Create a logo that represents the organization. It should be clean, modern, and work well at small sizes. Consider the org&apos;s mission and values when designing.
              </Text>
            </Box>
            <HStack width="100%">
              <Badge colorScheme="green">Easy</Badge>
              <Badge colorScheme="blue">2 hrs</Badge>
              <Spacer />
            </HStack>
          </VStack>
        </ModalBody>
        <ModalFooter borderTop="1.5px solid" borderColor="gray.200" py={2}>
          <Box flexGrow={1}>
            <VStack align="start" spacing={0}>
              <Text fontWeight="bold" fontSize="m">Reward: 10 {tokenLabel}</Text>
            </VStack>
          </Box>
          <Box>
            <Button textColor="white" variant="outline" mr={2} isDisabled>Share</Button>
            <Button colorScheme="teal" isDisabled>Claim Task</Button>
          </Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
