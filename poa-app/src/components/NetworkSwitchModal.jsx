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
import { useChainModal } from "@rainbow-me/rainbowkit";
import { NETWORKS, DEFAULT_NETWORK } from "../config/networks";

const defaultNetworkConfig = NETWORKS[DEFAULT_NETWORK];
const defaultNetworkName = defaultNetworkConfig.name;
const isDefaultTestnet = defaultNetworkConfig.isTestnet;

const NetworkSwitchModal = ({ isOpen, onClose }) => {
  const { openChainModal } = useChainModal();

  const handleNetworkSwitch = async () => {
    openChainModal();
    onClose();
  };

  return (
    <Portal>
      <Modal  isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay zIndex="1400" />
        <ModalContent zIndex="1500">
          <ModalHeader>Wrong Network</ModalHeader>
          <ModalBody >
            <Text fontSize={"lg"} mb="4">Please switch to {defaultNetworkName} to continue and then try again.</Text>
            {isDefaultTestnet && (
              <Text>If you need testnet ETH, get it from a {defaultNetworkName} faucet.</Text>
            )}
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={handleNetworkSwitch}>
              Switch to {defaultNetworkName}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Portal>
  );
};

export default NetworkSwitchModal;
