/**
 * ClaimRoleButton - Button to claim a role (hat) for the current user
 * Shows different states based on eligibility, application, and claiming status
 */

import React from 'react';
import {
  Button,
  Tooltip,
  Icon,
  Spinner,
} from '@chakra-ui/react';
import { FiCheckCircle, FiUserPlus, FiLock, FiSend } from 'react-icons/fi';

/**
 * ClaimRoleButton component
 * @param {Object} props
 * @param {Object} props.role - Role data including hatId, defaultEligible, vouchingEnabled
 * @param {boolean} props.userHasRole - Whether the current user already has this role
 * @param {boolean} props.isClaiming - Whether this role is currently being claimed
 * @param {Function} props.onClaim - Callback when claim button is clicked
 * @param {boolean} props.disabled - Whether the button should be disabled
 * @param {boolean} props.isConnected - Whether wallet is connected
 * @param {Object} props.vouchProgress - User's vouch progress { current, quorum, isComplete }
 * @param {boolean} props.hasApplied - Whether user has an active application
 * @param {boolean} props.isApplying - Whether an application is being submitted
 * @param {boolean} props.isWithdrawing - Whether an application is being withdrawn
 * @param {Function} props.onApply - Callback when apply button is clicked
 * @param {Function} props.onWithdraw - Callback when withdraw button is clicked
 */
export function ClaimRoleButton({
  role,
  userHasRole = false,
  isClaiming = false,
  onClaim,
  disabled = false,
  isConnected = true,
  vouchProgress = null,
  hasApplied = false,
  isApplying = false,
  isWithdrawing = false,
  onApply,
  onWithdraw,
}) {
  const { hatId, defaultEligible, vouchingEnabled, vouchingQuorum } = role;

  // User already has this role
  if (userHasRole) {
    return (
      <Tooltip label="You have this role" placement="top">
        <Button
          size="sm"
          variant="ghost"
          colorScheme="green"
          leftIcon={<Icon as={FiCheckCircle} />}
          isDisabled
          _disabled={{
            opacity: 0.8,
            cursor: 'default',
          }}
        >
          Claimed
        </Button>
      </Tooltip>
    );
  }

  // Not connected
  if (!isConnected) {
    return (
      <Tooltip label="Connect wallet to claim roles" placement="top">
        <Button
          size="sm"
          variant="outline"
          colorScheme="purple"
          leftIcon={<Icon as={FiLock} />}
          isDisabled
        >
          Claim
        </Button>
      </Tooltip>
    );
  }

  // Requires vouching (not directly claimable)
  if (vouchingEnabled && !defaultEligible) {
    // User has enough vouches - can claim!
    if (vouchProgress?.isComplete) {
      return (
        <Tooltip label="You have enough vouches to claim this role!" placement="top">
          <Button
            size="sm"
            variant="solid"
            colorScheme="green"
            leftIcon={isClaiming ? <Spinner size="xs" /> : <Icon as={FiCheckCircle} />}
            isLoading={isClaiming}
            loadingText="Claiming..."
            isDisabled={disabled || isClaiming}
            onClick={() => onClaim?.(hatId)}
            _hover={{
              transform: 'scale(1.02)',
              boxShadow: '0 0 20px rgba(72, 187, 120, 0.4)',
            }}
            transition="all 0.2s"
          >
            Claim Role
          </Button>
        </Tooltip>
      );
    }

    // User has some vouches but not enough
    if (vouchProgress?.current > 0) {
      return (
        <Tooltip
          label={`${vouchProgress.current} of ${vouchProgress.quorum} vouches received${hasApplied ? ' - Application submitted' : ''}`}
          placement="top"
        >
          <Button
            size="sm"
            variant="outline"
            colorScheme={hasApplied ? 'green' : 'yellow'}
            leftIcon={<Icon as={hasApplied ? FiCheckCircle : FiUserPlus} />}
            isDisabled={!hasApplied}
            isLoading={isWithdrawing}
            loadingText="Withdrawing..."
            onClick={hasApplied ? () => onWithdraw?.(hatId) : undefined}
          >
            {vouchProgress.current}/{vouchProgress.quorum} Vouches
          </Button>
        </Tooltip>
      );
    }

    // No vouches yet - show "Apply" or "Applied"
    if (hasApplied) {
      return (
        <Tooltip label="You have applied for this role. Click to withdraw." placement="top">
          <Button
            size="sm"
            variant="outline"
            colorScheme="green"
            leftIcon={isWithdrawing ? <Spinner size="xs" /> : <Icon as={FiCheckCircle} />}
            isLoading={isWithdrawing}
            loadingText="Withdrawing..."
            isDisabled={isWithdrawing}
            onClick={() => onWithdraw?.(hatId)}
          >
            Applied
          </Button>
        </Tooltip>
      );
    }

    return (
      <Tooltip label={`Apply for this role (requires ${vouchingQuorum || 'N'} vouches)`} placement="top">
        <Button
          size="sm"
          variant="solid"
          colorScheme="purple"
          leftIcon={isApplying ? <Spinner size="xs" /> : <Icon as={FiSend} />}
          isLoading={isApplying}
          loadingText="Applying..."
          isDisabled={disabled || isApplying}
          onClick={() => onApply?.(hatId)}
        >
          Apply
        </Button>
      </Tooltip>
    );
  }

  // Directly claimable (defaultEligible = true)
  if (defaultEligible) {
    return (
      <Tooltip label="Claim this role" placement="top">
        <Button
          size="sm"
          variant="solid"
          colorScheme="purple"
          leftIcon={isClaiming ? <Spinner size="xs" /> : <Icon as={FiUserPlus} />}
          isLoading={isClaiming}
          loadingText="Claiming..."
          isDisabled={disabled || isClaiming}
          onClick={() => onClaim?.(hatId)}
          _hover={{
            transform: 'scale(1.02)',
            boxShadow: '0 0 20px rgba(148, 115, 220, 0.4)',
          }}
          transition="all 0.2s"
        >
          Claim Role
        </Button>
      </Tooltip>
    );
  }

  // Default: not claimable (shouldn't reach here typically)
  return (
    <Tooltip label="This role cannot be claimed directly" placement="top">
      <Button
        size="sm"
        variant="ghost"
        colorScheme="gray"
        leftIcon={<Icon as={FiLock} />}
        isDisabled
      >
        Restricted
      </Button>
    </Tooltip>
  );
}

export default ClaimRoleButton;
