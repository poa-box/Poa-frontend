import React from 'react';
import { HStack, Input, InputGroup, InputRightAddon, Select } from '@chakra-ui/react';
import { splitHoursMinutes, combineHoursMinutes } from '@/util/taskUtils';

const MINUTE_OPTIONS = [0, 15, 30, 45];

/**
 * Hours + 15-minute-interval duration picker, used when an org pays by hours
 * only. `value` is decimal hours (the format stored in IPFS / the subgraph);
 * `onChange` is called with the recombined decimal hours. Whole hours come
 * from the number input, minutes from a 0/15/30/45 select, so the emitted
 * value is always a clean multiple of 0.25.
 *
 * Styling is passed in (inputStyles/selectStyles) so the picker matches the
 * surrounding modal's theme instead of hardcoding one look.
 */
const EstTimePicker = ({ value, onChange, inputStyles = {}, selectStyles = {}, size = 'md' }) => {
  const { hours, minutes } = splitHoursMinutes(value);

  const handleHours = (e) => {
    const h = parseInt(e.target.value, 10);
    onChange(combineHoursMinutes(isNaN(h) ? 0 : h, minutes));
  };

  const handleMinutes = (e) => {
    onChange(combineHoursMinutes(hours, parseInt(e.target.value, 10)));
  };

  return (
    <HStack spacing={2} align="center">
      <InputGroup size={size}>
        <Input
          type="number"
          min="0"
          step="1"
          value={hours}
          onChange={handleHours}
          aria-label="Estimated hours"
          {...inputStyles}
        />
        <InputRightAddon
          bg="whiteAlpha.100"
          borderColor="whiteAlpha.200"
          color="gray.400"
        >
          h
        </InputRightAddon>
      </InputGroup>
      <Select
        value={minutes}
        onChange={handleMinutes}
        size={size}
        aria-label="Estimated minutes"
        {...selectStyles}
      >
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')} min
          </option>
        ))}
      </Select>
    </HStack>
  );
};

export default EstTimePicker;
