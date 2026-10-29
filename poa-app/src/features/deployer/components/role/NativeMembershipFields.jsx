import { Box, HStack, Text, Select, NumberInput, NumberInputField } from '@chakra-ui/react';

export const membershipMethod = role => role.vouching?.enabled ? 'vouching' : role.open ? 'open' : 'governance';
export function changeMembershipMethod(role, method) {
  return { ...role, open: method === 'open', vouching: { ...role.vouching,
    enabled: method === 'vouching', quorum: role.vouching?.quorum || 1 } };
}
export function membershipSummary(role, roles) {
  if (role.vouching?.enabled) return `${role.vouching.quorum} vouch${role.vouching.quorum === 1 ? '' : 'es'} from members of ${roles[role.vouching.voucherRoleIndex]?.name || 'the selected role'}`;
  return role.open ? 'Anyone can claim this role' : 'Granted through governance';
}
export default function NativeMembershipFields({ role, roles, onChange }) {
  const updateVouching = updates => onChange({ ...role, vouching: { ...role.vouching, ...updates } });
  return <Box>
    <Text fontSize="xs" color="warmGray.500" fontWeight="600" mb={2}>How do new members join?</Text>
    <Select aria-label="Membership rule" size="sm" value={membershipMethod(role)}
      onChange={event => onChange(changeMembershipMethod(role, event.target.value))}>
      <option value="open">Anyone can claim</option>
      <option value="vouching">Needs member vouches</option>
      <option value="governance">Granted through governance</option>
    </Select>
    {role.vouching?.enabled && <HStack mt={3} spacing={2}>
      <NumberInput aria-label="Required vouches" size="sm" min={1} max={100} w="80px"
        value={role.vouching.quorum} onChange={(_, value) => updateVouching({ quorum: value })}>
        <NumberInputField aria-label="Required vouches" />
      </NumberInput>
      <Text fontSize="sm">vouches from</Text>
      <Select aria-label="Members who can vouch" size="sm" value={role.vouching.voucherRoleIndex}
        onChange={event => updateVouching({ voucherRoleIndex: Number(event.target.value) })}>
        {roles.map((candidate, index) => <option key={candidate.id || index} value={index}>{candidate.name}</option>)}
      </Select>
    </HStack>}
    <Text fontSize="xs" color="warmGray.500" mt={2}>
      {membershipSummary(role, roles)}. Membership changes are decided through governance.
    </Text>
  </Box>;
}
