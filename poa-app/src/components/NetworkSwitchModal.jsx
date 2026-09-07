import React from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Text,
  Portal,
} from "@chakra-ui/react";
import { useWalletAction } from "@/components/common/WalletActionButton";
import { useChainModal } from "@/context/WalletContext";
import { NETWORKS, DEFAULT_NETWORK } from "../config/networks";

const defaultNetworkConfig = NETWORKS[DEFAULT_NETWORK];
const defaultNetworkName = defaultNetworkConfig.name;
const isDefaultTestnet = defaultNetworkConfig.isTestnet;

const NetworkSwitchModal = ({ isOpen, onClose }) => {
  const { openChainModal } = useChainModal();

  const intent = useWalletAction(async ({ signal }) => {
    await openChainModal({ signal });
    if (!signal.aborted) onClose();
  }, { enabled: isOpen });

  const handleClose = () => { intent.cancel(); onClose(); };

  return (
    <Portal>
      <Modal  isOpen={isOpen} onClose={handleClose} isCentered>
        <ModalOverlay zIndex="1400" />
        <ModalContent zIndex="1500">
          <ModalHeader>Wrong Network</ModalHeader>
          <ModalBody >
            <Text fontSize={"lg"} mb="4">Please switch to {defaultNetworkName} to continue and then try again.</Text>
            {isDefaultTestnet && (
              <Text>If you need testnet ETH, get it from a {defaultNetworkName} faucet.</Text>
            )}
          </ModalBody>
          {intent.error && <Text role="alert" px={6}>Couldn’t open networks. Please try again.</Text>}
          <ModalFooter>
            <Button colorScheme="blue" onClick={intent.run} onMouseEnter={intent.prepare} onFocus={intent.prepare}
              isLoading={intent.pending} loadingText="Opening…">
              {intent.error ? 'Try again' : `Switch to ${defaultNetworkName}`}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Portal>
  );
};

export default NetworkSwitchModal;
