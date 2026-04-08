/**
 * QuickAddRole - Inline component for adding new roles
 * Shows a dashed button that expands into an inline form
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Icon,
} from '@chakra-ui/react';
import { PiPlus } from 'react-icons/pi';

export function QuickAddRole({ onAdd }) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleAdd = () => {
    if (name.trim()) {
      onAdd(name.trim());
      setName('');
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setName('');
    setIsAdding(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && name.trim()) {
      handleAdd();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!isAdding) {
    return (
      <Button
        variant="outline"
        borderStyle="dashed"
        borderWidth="2px"
        borderColor="warmGray.300"
        bg="transparent"
        h="auto"
        py={6}
        w="100%"
        justifyContent="center"
        leftIcon={<Icon as={PiPlus} boxSize={5} />}
        color="warmGray.500"
        fontWeight="500"
        _hover={{
          borderColor: 'amethyst.400',
          bg: 'amethyst.50',
          color: 'amethyst.600',
        }}
        transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
        onClick={() => setIsAdding(true)}
      >
        Add another role
      </Button>
    );
  }

  return (
    <Box
      p={5}
      borderRadius="2xl"
      border="2px dashed"
      borderColor="amethyst.300"
      bg="amethyst.50"
    >
      <VStack spacing={4} align="stretch">
        <Text fontSize="sm" fontWeight="600" color="amethyst.700">
          New Role
        </Text>
        <Input
          ref={inputRef}
          placeholder="Role name (e.g., Advisor, Volunteer, Core Team)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          bg="white"
          borderColor="amethyst.200"
          _focus={{
            borderColor: 'amethyst.400',
            boxShadow: '0 0 0 1px var(--chakra-colors-amethyst-400)',
          }}
          _placeholder={{ color: 'warmGray.400' }}
        />
        <HStack justify="flex-end" spacing={2}>
          <Button
            size="sm"
            variant="ghost"
            color="warmGray.600"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            bg="warmGray.900"
            color="white"
            borderRadius="full"
            _hover={{ bg: 'warmGray.800' }}
            _active={{ bg: 'warmGray.700' }}
            onClick={handleAdd}
            isDisabled={!name.trim()}
          >
            Add Role
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}

export default QuickAddRole;
