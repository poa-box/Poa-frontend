/**
 * AccountControl
 *
 * Shared account menu for authenticated surfaces. RainbowKit's stock account
 * modal disconnects wagmi only, which is not enough for Poa's unified
 * EOA/passkey authentication: AuthContext must be signed out first so a stored
 * passkey is not immediately restored.
 */

import React from 'react';
import {
  Button,
  Icon,
  IconButton,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useWalletUI } from '@/context/WalletContext';
import WalletActionButton, { useWalletAction } from '@/components/common/WalletActionButton';
import { FaSignOutAlt, FaWallet, FaUserCircle } from 'react-icons/fa';
import { useAuth } from '@/context/authState';
import useUnifiedDisconnect from '@/hooks/useUnifiedDisconnect';
import PasskeyAccountInfo from '@/components/passkey/PasskeyAccountInfo';

function DisconnectMenuItem({ onDisconnect }) {
  return (
    <MenuItem
      onClick={onDisconnect}
      icon={<Icon as={FaSignOutAlt} color="red.300" />}
      borderRadius="md"
      bg="transparent"
      color="red.200"
      _hover={{ bg: 'red.900' }}
    >
      Disconnect
    </MenuItem>
  );
}

function AccountMenuList({ children }) {
  return (
    <MenuList
      minW="190px"
      p={1}
      borderRadius="xl"
      bg="gray.900"
      borderColor="whiteAlpha.300"
      boxShadow="xl"
      zIndex={1500}
    >
      {children}
    </MenuList>
  );
}

function WalletAccountControl({ size, compact, label }) {
  const handleDisconnect = useUnifiedDisconnect();
  const { account, chain, runtimeReady, openChainModal, openConnectModal } = useWalletUI();
  const chainIntent = useWalletAction(openChainModal);
  const connected = runtimeReady && account && chain;

        if (!connected) {
          return (
            <WalletActionButton
              size={size}
              leftIcon={<Icon as={label ? FaUserCircle : FaWallet} />}
              action={openConnectModal}
              bg="whiteAlpha.200"
              color="white"
              _hover={{ bg: 'whiteAlpha.300' }}
            >
              Connect
            </WalletActionButton>
          );
        }

        // An unsupported chain still needs a way out. RainbowKit's stock
        // "Wrong network" button opens the chain switcher and nothing else, so
        // a user on the wrong network could not disconnect at all.
        if (chain.unsupported) {
          return (
            <Menu placement="bottom-end">
              <MenuButton
                as={Button}
                size={size}
                colorScheme="red"
                rightIcon={<ChevronDownIcon />}
                aria-label="Wrong network — account menu"
              >
                Wrong network
              </MenuButton>
              <AccountMenuList>
                <MenuItem
                  onClick={chainIntent.run}
                  onMouseEnter={chainIntent.prepare}
                  onFocus={chainIntent.prepare}
                  isDisabled={chainIntent.pending}
                  borderRadius="md"
                  bg="transparent"
                  color="gray.200"
                  _hover={{ bg: 'whiteAlpha.200' }}
                >
                  {chainIntent.pending ? 'Opening…' : 'Switch network'}
                </MenuItem>
                {chainIntent.error && <MenuItem onClick={chainIntent.run}>Couldn’t open networks. Try again</MenuItem>}
              <MenuDivider borderColor="whiteAlpha.300" />
                <DisconnectMenuItem onDisconnect={handleDisconnect} />
              </AccountMenuList>
            </Menu>
          );
        }

        return (
          <Menu placement="bottom-end">
            {compact ? (
              <MenuButton
                as={IconButton}
                size={size}
                icon={<Icon as={label ? FaUserCircle : FaWallet} />}
                bg="whiteAlpha.200"
                color="white"
                _hover={{ bg: 'whiteAlpha.300' }}
                _active={{ bg: 'whiteAlpha.300' }}
                aria-label={`Account menu for ${account.displayName}`}
              />
            ) : (
              <MenuButton
                as={Button}
                size={size}
                rightIcon={<ChevronDownIcon />}
                leftIcon={<Icon as={label ? FaUserCircle : FaWallet} />}
                bg="whiteAlpha.200"
                color="white"
                _hover={{ bg: 'whiteAlpha.300' }}
                _active={{ bg: 'whiteAlpha.300' }}
                aria-label={`Account menu for ${account.displayName}`}
                maxW="200px"
              >
                <Text as="span" display="block" isTruncated>
                  {label || account.displayName}
                </Text>
              </MenuButton>
            )}
            <AccountMenuList>
              <MenuItem
                onClick={chainIntent.run}
                  onMouseEnter={chainIntent.prepare}
                  onFocus={chainIntent.prepare}
                  isDisabled={chainIntent.pending}
                borderRadius="md"
                bg="transparent"
                color="gray.200"
                _hover={{ bg: 'whiteAlpha.200' }}
              >
                {chainIntent.pending ? 'Opening…' : chain.name}
              </MenuItem>
              {chainIntent.error && <MenuItem onClick={chainIntent.run}>Couldn’t open networks. Try again</MenuItem>}
              <MenuDivider borderColor="whiteAlpha.300" />
              <DisconnectMenuItem onDisconnect={handleDisconnect} />
            </AccountMenuList>
          </Menu>
        );
}

/**
 * @param {object}  props
 * @param {string}  [props.size='sm']     Chakra size token for the wallet control.
 * @param {boolean} [props.compact=false] EOA-only. Renders the wallet control as an
 *   icon-only button instead of a labelled one. PasskeyAccountInfo manages its
 *   own presentation, so `compact` is intentionally not forwarded to it.
 * @param {string} [props.label] Neutral account label for surfaces that keep
 *   authentication details inside the menu. Applies to both account types.
 */
export default function AccountControl({ size = 'sm', compact = false, label }) {
  const { isPasskeyUser, isAuthHydrated } = useAuth();
  const { ensureRuntime } = useWalletUI();

  // Passkey restoration happens after the first client render. Rendering the
  // wallet branch before that restore settles produces a misleading Connect
  // button for one frame and lets a fast click open the wrong auth flow.
  if (!isAuthHydrated) return (
    <WalletActionButton action={ensureRuntime} size={size} minW={compact ? '32px' : '104px'}
      bg="whiteAlpha.200" color="white" aria-label="Prepare account">
      {compact ? <Icon as={FaUserCircle} /> : 'Account'}
    </WalletActionButton>
  );

  if (isPasskeyUser) return <PasskeyAccountInfo label={label} />;
  return <WalletAccountControl size={size} compact={compact} label={label} />;
}
