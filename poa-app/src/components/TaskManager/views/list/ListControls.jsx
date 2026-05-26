import { Flex, Select, Text, HStack } from '@chakra-ui/react';

export const SORT_OPTIONS = [
  { id: 'created_desc', label: 'Newest' },
  { id: 'created_asc', label: 'Oldest' },
  { id: 'difficulty_desc', label: 'Hardest first' },
  { id: 'payout_desc', label: 'Highest payout' },
  { id: 'hours_desc', label: 'Most hours' },
  { id: 'status', label: 'Status order' },
];

export const GROUP_OPTIONS = [
  { id: 'none', label: 'No grouping' },
  { id: 'status', label: 'By status' },
  { id: 'difficulty', label: 'By difficulty' },
  { id: 'assignee', label: 'By assignee' },
  { id: 'project', label: 'By project' },
];

const ListControls = ({ sortId, onSortChange, groupId, onGroupChange }) => (
  <HStack
    spacing={3}
    px={1}
    py={1}
    align="center"
    wrap="wrap"
  >
    <HStack spacing={1.5}>
      <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500" letterSpacing="wide">
        SORT
      </Text>
      <Select
        size="sm"
        value={sortId}
        onChange={(e) => onSortChange(e.target.value)}
        bg="whiteAlpha.100"
        color="white"
        border="1px solid"
        borderColor="whiteAlpha.200"
        borderRadius="md"
        _hover={{ borderColor: 'whiteAlpha.300' }}
        _focus={{ borderColor: 'purple.300', boxShadow: 'none' }}
        sx={{
          '> option': { background: '#1a1a1a', color: 'white' },
        }}
        minW="150px"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </HStack>

    <HStack spacing={1.5}>
      <Text fontSize="xs" color="whiteAlpha.600" fontWeight="500" letterSpacing="wide">
        GROUP
      </Text>
      <Select
        size="sm"
        value={groupId}
        onChange={(e) => onGroupChange(e.target.value)}
        bg="whiteAlpha.100"
        color="white"
        border="1px solid"
        borderColor="whiteAlpha.200"
        borderRadius="md"
        _hover={{ borderColor: 'whiteAlpha.300' }}
        _focus={{ borderColor: 'purple.300', boxShadow: 'none' }}
        sx={{
          '> option': { background: '#1a1a1a', color: 'white' },
        }}
        minW="150px"
      >
        {GROUP_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </HStack>
  </HStack>
);

export default ListControls;
