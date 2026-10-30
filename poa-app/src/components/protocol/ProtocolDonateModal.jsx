import React, { useState } from 'react';
import { Button, Input, InputGroup, InputRightAddon, Text, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton } from '@chakra-ui/react';
import { parseDecimalAmountToRaw } from '@poa-box/core/amounts';
import { useProtocolDonation } from '@/hooks/useProtocolDonation';

const ProtocolDonateModal = ({ isOpen, onClose, chain }) => {
  const [amount, setAmount] = useState('');
  const { donate, canDonate, isSending } = useProtocolDonation(chain, isOpen, () => {
    setAmount('');
    onClose();
  });
  let amountRaw = null;
  try { amountRaw = parseDecimalAmountToRaw(amount, 18); } catch { /* Keep invalid drafts editable. */ }
  const valid = amountRaw !== null && BigInt(amountRaw) > 0n;
  const handleDonate = () => {
    if (valid && canDonate && !isSending) return donate(amountRaw);
  };

  return (
    <Modal isOpen={isOpen} onClose={isSending ? () => {} : onClose} closeOnOverlayClick={!isSending} closeOnEsc={!isSending} size="sm" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Donate to Solidarity Fund</ModalHeader>
        {!isSending && <ModalCloseButton />}
        <ModalBody>
          <Text fontSize="sm" color="warmGray.500" mb={4}>
            Your donation helps new organizations get started on {chain.name}.
          </Text>
          <InputGroup>
            <Input
              placeholder="0.5"
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              isDisabled={isSending}
            />
            <InputRightAddon>{chain.nativeCurrency}</InputRightAddon>
          </InputGroup>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose} isDisabled={isSending}>Cancel</Button>
          <Button
            colorScheme="green"
            onClick={handleDonate}
            isLoading={isSending}
            loadingText="Sending..."
            isDisabled={!valid || !canDonate}
          >
            Donate
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ProtocolDonateModal;
