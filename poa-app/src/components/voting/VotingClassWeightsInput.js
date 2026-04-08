/**
 * VotingClassWeightsInput
 * Custom input component for editing voting class weight splits.
 * Used in governance proposals to adjust hybrid voting class slicePct values.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Badge,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';

const STRATEGY_LABELS = {
  DIRECT: 'Democracy',
  ERC20_BAL: 'Participation',
  0: 'Democracy',
  1: 'Participation',
};

const STRATEGY_COLORS = {
  DIRECT: 'purple',
  ERC20_BAL: 'blue',
  0: 'purple',
  1: 'blue',
};

/**
 * Stacked color bar showing the weight distribution
 */
const WeightBar = ({ classes }) => {
  return (
    <HStack spacing={0} h="8px" borderRadius="full" overflow="hidden" w="100%">
      {classes.map((cls) => {
        const color = STRATEGY_COLORS[cls.strategy] || 'gray';
        return (
          <Box
            key={cls.classIndex ?? cls.strategy}
            h="100%"
            w={`${cls.slicePct}%`}
            bg={`${color}.400`}
            transition="width 0.2s"
          />
        );
      })}
    </HStack>
  );
};

/**
 * Single class row with strategy label and weight slider
 */
const ClassRow = ({ cls, index, onWeightChange, totalClasses }) => {
  const label = STRATEGY_LABELS[cls.strategy] || `Class ${index + 1}`;
  const color = STRATEGY_COLORS[cls.strategy] || 'gray';

  return (
    <Box
      p={3}
      bg="whiteAlpha.50"
      borderRadius="md"
      border="1px solid rgba(148, 115, 220, 0.2)"
    >
      <HStack justify="space-between" mb={2}>
        <HStack spacing={2}>
          <Badge colorScheme={color} variant="subtle" fontSize="xs">
            {label}
          </Badge>
          {cls.quadratic && (
            <Badge colorScheme="teal" variant="subtle" fontSize="xs">
              Quadratic
            </Badge>
          )}
        </HStack>
        <Text fontSize="lg" fontWeight="bold" color={`${color}.300`}>
          {cls.slicePct}%
        </Text>
      </HStack>
      <Slider
        value={cls.slicePct}
        onChange={(val) => onWeightChange(index, val)}
        min={1}
        max={totalClasses > 1 ? 99 : 100}
        step={1}
        focusThumbOnChange={false}
      >
        <SliderTrack bg="whiteAlpha.200">
          <SliderFilledTrack bg={`${color}.400`} />
        </SliderTrack>
        <SliderThumb boxSize={5}>
          <Text fontSize="2xs" fontWeight="bold" color="gray.700">
            {cls.slicePct}
          </Text>
        </SliderThumb>
      </Slider>
    </Box>
  );
};

const VotingClassWeightsInput = ({ currentClasses = [], value, onChange }) => {
  // Initialize local state from value (if set) or currentClasses
  const [classes, setClasses] = useState(() => {
    if (Array.isArray(value) && value.length > 0) return value;
    if (Array.isArray(currentClasses) && currentClasses.length > 0) {
      return currentClasses.map(cls => ({ ...cls }));
    }
    return [];
  });

  // Sync when currentClasses changes and value is empty
  useEffect(() => {
    if ((!value || value.length === 0) && currentClasses.length > 0) {
      const initial = currentClasses.map(cls => ({ ...cls }));
      setClasses(initial);
      onChange(initial);
    }
  }, [currentClasses]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSlice = classes.reduce((sum, c) => sum + Number(c.slicePct), 0);
  const isValid = totalSlice === 100;

  /**
   * Handle weight change with proportional redistribution.
   * Ported from VotingStep.jsx lines 144-200.
   */
  const handleWeightChange = useCallback((changedIndex, newWeight) => {
    setClasses(prev => {
      const updated = prev.map(c => ({ ...c }));

      if (updated.length === 1) {
        updated[0] = { ...updated[0], slicePct: 100 };
        onChange(updated);
        return updated;
      }

      // For 2 classes: simple complementary
      if (updated.length === 2) {
        const otherIndex = changedIndex === 0 ? 1 : 0;
        updated[changedIndex] = { ...updated[changedIndex], slicePct: newWeight };
        updated[otherIndex] = { ...updated[otherIndex], slicePct: 100 - newWeight };
        onChange(updated);
        return updated;
      }

      // For N classes: proportional redistribution
      const oldWeight = updated[changedIndex].slicePct;
      const delta = newWeight - oldWeight;
      if (delta === 0) return prev;

      const otherTotal = updated.reduce((sum, cls, idx) => {
        return idx === changedIndex ? sum : sum + cls.slicePct;
      }, 0);

      if (otherTotal === 0) {
        // Edge case: distribute evenly
        const otherCount = updated.length - 1;
        const remaining = 100 - newWeight;
        const perClass = Math.floor(remaining / otherCount);
        let leftover = remaining - (perClass * otherCount);

        updated.forEach((cls, idx) => {
          if (idx === changedIndex) {
            updated[idx] = { ...cls, slicePct: newWeight };
          } else {
            const extra = leftover > 0 ? 1 : 0;
            leftover -= extra;
            updated[idx] = { ...cls, slicePct: perClass + extra };
          }
        });
        onChange(updated);
        return updated;
      }

      // Proportional redistribution
      const remaining = 100 - newWeight;
      const scaleFactor = remaining / otherTotal;

      const newWeights = updated.map((cls, idx) => {
        if (idx === changedIndex) return newWeight;
        return Math.max(1, Math.round(cls.slicePct * scaleFactor));
      });

      // Fix rounding
      let sum = newWeights.reduce((a, b) => a + b, 0);
      let diff = 100 - sum;
      if (diff !== 0) {
        let maxIdx = -1;
        let maxVal = 0;
        newWeights.forEach((w, idx) => {
          if (idx !== changedIndex && w > maxVal) {
            maxVal = w;
            maxIdx = idx;
          }
        });
        if (maxIdx >= 0) newWeights[maxIdx] += diff;
      }

      newWeights.forEach((weight, idx) => {
        updated[idx] = { ...updated[idx], slicePct: weight };
      });

      onChange(updated);
      return updated;
    });
  }, [onChange]);

  if (classes.length === 0) {
    return (
      <Alert status="warning" borderRadius="md" bg="rgba(236, 201, 75, 0.15)">
        <AlertIcon color="yellow.300" />
        <Text fontSize="sm" color="yellow.200">
          No voting classes found. This organization may not have hybrid voting configured.
        </Text>
      </Alert>
    );
  }

  return (
    <VStack spacing={3} align="stretch">
      <Text fontSize="xs" color="gray.400">
        Current voting power split — drag sliders to adjust
      </Text>

      <WeightBar classes={classes} />

      <HStack justify="center" spacing={4} py={1}>
        {classes.map((cls, i) => {
          const label = STRATEGY_LABELS[cls.strategy] || `Class ${(cls.classIndex ?? i) + 1}`;
          const color = STRATEGY_COLORS[cls.strategy] || 'gray';
          return (
            <HStack key={cls.classIndex ?? cls.strategy} spacing={1}>
              <Box w="8px" h="8px" borderRadius="full" bg={`${color}.400`} />
              <Text fontSize="xs" color="gray.400">
                {label}: {cls.slicePct}%
              </Text>
            </HStack>
          );
        })}
      </HStack>

      {classes.map((cls, i) => (
        <ClassRow
          key={cls.classIndex ?? cls.strategy}
          cls={cls}
          index={i}
          onWeightChange={handleWeightChange}
          totalClasses={classes.length}
        />
      ))}

      <Box
        p={2}
        borderRadius="md"
        bg={isValid ? 'rgba(72, 187, 120, 0.1)' : 'rgba(245, 101, 101, 0.1)'}
        border="1px solid"
        borderColor={isValid ? 'rgba(72, 187, 120, 0.3)' : 'rgba(245, 101, 101, 0.3)'}
      >
        <Text
          fontSize="xs"
          fontWeight="medium"
          color={isValid ? 'green.300' : 'red.300'}
          textAlign="center"
        >
          Total: {totalSlice}% {isValid ? '' : '(must equal 100%)'}
        </Text>
      </Box>
    </VStack>
  );
};

export default VotingClassWeightsInput;
