/**
 * PasskeyAccountInfo
 * Header display for passkey-authenticated users.
 * Shows truncated account address with fingerprint icon and disconnect option.
 */

import {
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  HStack,
  Text,
  Icon,
} from '@chakra-ui/react';
import { FaFingerprint, FaSignOutAlt } from 'react-icons/fa';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useAuth } from '../../context/AuthContext';

export default function PasskeyAccountInfo() {
  const { accountAddress, disconnectPasskey, isPasskeyUser } = useAuth();

  if (!isPasskeyUser || !accountAddress) return null;

  const truncated = `${accountAddress.substring(0, 6)}...${accountAddress.substring(accountAddress.length - 4)}`;

  return (
    <Menu>
      <MenuButton
        as={Button}
        size="sm"
        variant="outline"
        borderRadius="full"
        borderColor="amethyst.300"
        bg="rgba(255, 255, 255, 0.8)"
        backdropFilter="blur(8px)"
        _hover={{ bg: 'rgba(255, 255, 255, 0.95)', borderColor: 'amethyst.400' }}
        _active={{ bg: 'white' }}
        rightIcon={<ChevronDownIcon />}
      >
        <HStack spacing={2}>
          <Icon as={FaFingerprint} color="amethyst.500" boxSize={4} />
          <Text fontSize="sm" fontFamily="mono" fontWeight="500">
            {truncated}
          </Text>
        </HStack>
      </MenuButton>
      <MenuList
        borderRadius="xl"
        boxShadow="lg"
        minW="180px"
        p={1}
      >
        <MenuItem
          onClick={disconnectPasskey}
          icon={<Icon as={FaSignOutAlt} color="red.400" />}
          borderRadius="md"
          _hover={{ bg: 'red.50' }}
          fontSize="sm"
          fontWeight="500"
        >
          Disconnect Passkey
        </MenuItem>
      </MenuList>
    </Menu>
  );
}
