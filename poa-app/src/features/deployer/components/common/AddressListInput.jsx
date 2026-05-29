/**
 * AddressListInput - edit a list of EVM addresses (add / remove / validate).
 * Used for DirectDemocracy execution targets and bootstrap project managers/bounty tokens.
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Input,
  IconButton,
  Button,
  Text,
} from '@chakra-ui/react';
import { AddIcon, CloseIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';

export function AddressListInput({
  value = [],
  onChange,
  placeholder = '0x…',
  addLabel = 'Add address',
  emptyHint,
}) {
  const list = Array.isArray(value) ? value : [];

  const setAt = (idx, next) => {
    const copy = [...list];
    copy[idx] = next;
    onChange(copy);
  };
  const removeAt = (idx) => onChange(list.filter((_, i) => i !== idx));
  const add = () => onChange([...list, '']);

  return (
    <VStack align="stretch" spacing={2}>
      {list.length === 0 && emptyHint && (
        <Text fontSize="xs" color="warmGray.500">{emptyHint}</Text>
      )}
      {list.map((addr, idx) => {
        const trimmed = (addr || '').trim();
        const invalid = trimmed.length > 0 && !ethers.utils.isAddress(trimmed);
        return (
          <HStack key={idx} spacing={2}>
            <Box flex="1">
              <Input
                value={addr}
                onChange={(e) => setAt(idx, e.target.value)}
                placeholder={placeholder}
                size="sm"
                fontFamily="mono"
                isInvalid={invalid}
                borderRadius="md"
              />
              {invalid && (
                <Text fontSize="xs" color="red.400" mt={1}>Not a valid address</Text>
              )}
            </Box>
            <IconButton
              aria-label="Remove"
              icon={<CloseIcon boxSize={2.5} />}
              size="sm"
              variant="ghost"
              onClick={() => removeAt(idx)}
            />
          </HStack>
        );
      })}
      <Button leftIcon={<AddIcon boxSize={3} />} size="sm" variant="outline" onClick={add} alignSelf="flex-start">
        {addLabel}
      </Button>
    </VStack>
  );
}

export default AddressListInput;
