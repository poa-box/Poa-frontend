import React from 'react';
import {
  FormControl,
  FormLabel,
  Select,
  Textarea,
  Text,
  Badge,
  HStack,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react';

export function RoleApplicationForm({
  roles,
  selectedHatId,
  onSelectRole,
  notes,
  onNotesChange,
  experience,
  onExperienceChange,
}) {
  const textColor = useColorModeValue('gray.800', 'white');
  const inputBg = useColorModeValue('white', 'whiteAlpha.100');
  const borderColor = useColorModeValue('gray.300', 'whiteAlpha.300');
  const labelColor = useColorModeValue('gray.700', 'gray.200');
  const hintColor = useColorModeValue('gray.500', 'gray.400');
  const placeholderColor = useColorModeValue('gray.400', 'gray.500');

  const singleRole = roles.length === 1;
  const selectedRole = roles.find(r => String(r.hatId) === String(selectedHatId));

  return (
    <VStack spacing={4} align="stretch">
      {singleRole ? (
        <HStack>
          <Text fontSize="sm" color={labelColor}>Applying for:</Text>
          <Badge colorScheme="teal" fontSize="sm">{roles[0].name}</Badge>
          {roles[0].vouchingQuorum && (
            <Text fontSize="xs" color={hintColor}>
              ({roles[0].vouchingQuorum} {roles[0].vouchingQuorum === 1 ? 'vouch' : 'vouches'} required)
            </Text>
          )}
        </HStack>
      ) : (
        <FormControl isRequired>
          <FormLabel color={labelColor} fontSize="sm">Select a Role</FormLabel>
          <Select
            placeholder="Choose a role to apply for"
            value={selectedHatId || ''}
            onChange={(e) => onSelectRole(e.target.value || null)}
            bg={inputBg}
            color={textColor}
            borderColor={borderColor}
            _focus={{ borderColor: 'teal.400', boxShadow: '0 0 0 1px teal.400' }}
          >
            {roles.map((role) => (
              <option key={role.hatId} value={role.hatId}>
                {role.name} ({role.vouchingQuorum} {role.vouchingQuorum === 1 ? 'vouch' : 'vouches'} required)
              </option>
            ))}
          </Select>
          {selectedRole && (
            <Text fontSize="xs" color={hintColor} mt={1}>
              Existing members will review your application and vouch for you.
            </Text>
          )}
        </FormControl>
      )}

      <FormControl isRequired>
        <FormLabel color={labelColor} fontSize="sm">Why do you want this role?</FormLabel>
        <Textarea
          placeholder="Explain your interest and what you'd contribute..."
          value={notes}
          onChange={onNotesChange}
          rows={3}
          bg={inputBg}
          color={textColor}
          borderColor={borderColor}
          _placeholder={{ color: placeholderColor }}
          _focus={{ borderColor: 'teal.400', boxShadow: '0 0 0 1px teal.400' }}
        />
      </FormControl>

      <FormControl>
        <FormLabel color={labelColor} fontSize="sm">Relevant Experience (Optional)</FormLabel>
        <Textarea
          placeholder="Describe any relevant experience or skills..."
          value={experience}
          onChange={onExperienceChange}
          rows={2}
          bg={inputBg}
          color={textColor}
          borderColor={borderColor}
          _placeholder={{ color: placeholderColor }}
          _focus={{ borderColor: 'teal.400', boxShadow: '0 0 0 1px teal.400' }}
        />
      </FormControl>
    </VStack>
  );
}

export default RoleApplicationForm;
