/**
 * GasSponsorshipBadge
 * Visual indicator showing gas sponsorship status for passkey users.
 */

import { Badge, HStack, Icon, Tooltip } from '@chakra-ui/react';
import { BsFillLightningChargeFill } from 'react-icons/bs';
import { useAuth } from '../../context/AuthContext';

export default function GasSponsorshipBadge() {
  const { isPasskeyUser } = useAuth();

  if (!isPasskeyUser) return null;

  return (
    <Tooltip label="Transaction fees are sponsored by the organization" hasArrow>
      <Badge
        colorScheme="green"
        variant="subtle"
        borderRadius="full"
        px={3}
        py={1}
        fontSize="xs"
        fontWeight="600"
      >
        <HStack spacing={1}>
          <Icon as={BsFillLightningChargeFill} boxSize={3} />
          <span>Gas Sponsored</span>
        </HStack>
      </Badge>
    </Tooltip>
  );
}
