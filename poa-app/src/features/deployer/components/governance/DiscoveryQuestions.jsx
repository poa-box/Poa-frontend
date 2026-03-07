/**
 * DiscoveryQuestions - Step-by-step discovery flow for templates
 *
 * Shows discovery questions one at a time with explanations of why each
 * question matters and the impact of each choice. When all questions are
 * answered, "See Recommendation" navigates to the full RecommendationView.
 */

import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  RadioGroup,
  Radio,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useColorModeValue,
  ScaleFade,
  Icon,
} from '@chakra-ui/react';
import { PiArrowLeft, PiArrowRight } from 'react-icons/pi';
import { useDeployer } from '../../context/DeployerContext';
import { findBestVariation } from '../../templates/variations/variationMatcher';

/**
 * Custom gradient progress bar with step dots
 */
function ProgressBar({ current, total, answers, questions }) {
  const trackBg = useColorModeValue('warmGray.100', 'warmGray.700');
  const dotBg = useColorModeValue('warmGray.300', 'warmGray.500');
  const dotFilledBg = useColorModeValue('amethyst.500', 'amethyst.400');
  const labelColor = useColorModeValue('warmGray.400', 'warmGray.500');
  const counterColor = useColorModeValue('warmGray.900', 'white');

  // Fill to the current dot position. With space-between, dots sit at
  // 0%, 50%, 100% for 3 items — so progress = current / (total - 1).
  const progress = total > 1 ? (current / (total - 1)) * 100 : 0;

  return (
    <Box>
      <HStack justify="space-between" mb={3}>
        <Text fontSize="sm" color={labelColor}>
          Tell us about your organization
        </Text>
        <Text fontSize="sm">
          <Text as="span" fontWeight="600" color={counterColor}>{current + 1}</Text>
          <Text as="span" color={labelColor}> of {total}</Text>
        </Text>
      </HStack>

      {/* Track with gradient fill */}
      <Box position="relative" h="6px" borderRadius="full" bg={trackBg}>
        <Box
          h="100%"
          borderRadius="full"
          bgGradient="linear(90deg, #9055E8, #E85D85)"
          w={`${progress}%`}
          transition="width 0.4s ease"
        />
        {/* Step dots */}
        <HStack
          position="absolute"
          top="50%"
          left="0"
          right="0"
          transform="translateY(-50%)"
          justify="space-between"
        >
          {questions.map((q, i) => {
            const isAnswered = !!answers[q.id];
            const isCurrent = i === current;
            return (
              <Box
                key={q.id}
                w="10px"
                h="10px"
                borderRadius="full"
                bg={isAnswered || isCurrent ? dotFilledBg : dotBg}
                border="2px solid"
                borderColor={isCurrent ? 'white' : 'transparent'}
                boxShadow={isCurrent ? '0 0 0 2px rgba(144,85,232,0.4)' : undefined}
                transition="all 0.3s ease"
              />
            );
          })}
        </HStack>
      </Box>
    </Box>
  );
}

/**
 * Single question card with explanation and options
 */
function QuestionCard({ question, answer, onAnswer, isActive }) {
  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(51, 48, 44, 0.8)');
  const borderColor = useColorModeValue('warmGray.100', 'warmGray.700');
  const helperColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const headingColor = useColorModeValue('warmGray.900', 'white');
  const optionBorder = useColorModeValue('warmGray.200', 'warmGray.600');
  const selectedBg = useColorModeValue('amethyst.50', 'rgba(144, 85, 232, 0.08)');
  const selectedBorder = useColorModeValue('amethyst.500', 'amethyst.400');
  const hoverBg = useColorModeValue('warmGray.50', 'warmGray.800');
  const hoverBorder = useColorModeValue('warmGray.300', 'warmGray.500');

  if (!question) return null;

  return (
    <ScaleFade in={isActive} initialScale={0.95}>
      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="2xl"
        boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
        backdropFilter="blur(16px)"
        p={{ base: 6, md: 8 }}
      >
        <VStack spacing={6} align="stretch">
          {/* Question */}
          <Box>
            <Heading size="lg" mb={2} color={headingColor} letterSpacing="-0.01em">
              {question.question}
            </Heading>
            <Text color={helperColor} fontSize="md" lineHeight="tall">
              {question.why}
            </Text>
          </Box>

          {/* Options */}
          <RadioGroup value={answer || ''} onChange={onAnswer}>
            <VStack spacing={3} align="stretch">
              {question.options.map((option) => {
                const isSelected = answer === option.value;
                return (
                  <Box
                    key={option.value}
                    p={5}
                    borderWidth="2px"
                    borderRadius="xl"
                    borderColor={isSelected ? selectedBorder : optionBorder}
                    bg={isSelected ? selectedBg : 'transparent'}
                    boxShadow={
                      isSelected
                        ? '0 0 0 3px rgba(144, 85, 232, 0.15)'
                        : '0 1px 3px rgba(0, 0, 0, 0.04)'
                    }
                    cursor="pointer"
                    onClick={() => onAnswer(option.value)}
                    transition="all 0.2s ease"
                    _hover={{
                      borderColor: isSelected ? selectedBorder : hoverBorder,
                      bg: isSelected ? selectedBg : hoverBg,
                    }}
                  >
                    <HStack justify="space-between" align="flex-start">
                      <VStack align="start" spacing={1} flex={1}>
                        <HStack>
                          {option.emoji && (
                            <Text fontSize="lg">{option.emoji}</Text>
                          )}
                          <Text fontWeight="medium">{option.label}</Text>
                        </HStack>
                        <Text fontSize="sm" color={helperColor}>
                          {option.impact}
                        </Text>
                      </VStack>
                      <Radio
                        value={option.value}
                        size="lg"
                        colorScheme="purple"
                        isChecked={isSelected}
                      />
                    </HStack>
                  </Box>
                );
              })}
            </VStack>
          </RadioGroup>
        </VStack>
      </Box>
    </ScaleFade>
  );
}

/**
 * Self-assessment warning for custom template
 */
function SelfAssessmentWarning({ riskLevel, feedback }) {
  const severity = riskLevel === 'high' ? 'warning'
    : riskLevel === 'medium' ? 'info'
    : 'success';

  return (
    <Alert status={severity} borderRadius="xl" mt={4}>
      <AlertIcon />
      <Box>
        <AlertTitle>
          {riskLevel === 'high' ? 'Consider Carefully' :
           riskLevel === 'medium' ? 'Good to Know' : 'Looking Good'}
        </AlertTitle>
        <AlertDescription>{feedback}</AlertDescription>
      </Box>
    </Alert>
  );
}

/**
 * Main DiscoveryQuestions component
 */
export function DiscoveryQuestions({ template, onSkip, onSeeRecommendation }) {
  const { state, actions } = useDeployer();

  const helperColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const navColor = useColorModeValue('warmGray.600', 'warmGray.400');
  const skipColor = useColorModeValue('warmGray.400', 'warmGray.500');

  const { discoveryAnswers, currentQuestionIndex, matchedVariation } = state.templateJourney;

  // Ref for auto-advance timer
  const autoAdvanceTimer = useRef(null);

  // Get questions based on template type
  const questions = useMemo(() => {
    // For custom template, show self-assessment first
    if (template?.id === 'custom' && template.selfAssessment) {
      const assessmentDone = template.selfAssessment.every(
        (q) => state.templateJourney.selfAssessmentAnswers[q.id]
      );
      if (!assessmentDone) {
        return template.selfAssessment;
      }
    }
    return template?.discoveryQuestions || [];
  }, [template, state.templateJourney.selfAssessmentAnswers]);

  const isCustomAssessment = template?.id === 'custom' &&
    template.selfAssessment &&
    !template.selfAssessment.every(
      (q) => state.templateJourney.selfAssessmentAnswers[q.id]
    );

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;

  // Calculate current answer
  const currentAnswer = isCustomAssessment
    ? state.templateJourney.selfAssessmentAnswers[currentQuestion?.id]
    : discoveryAnswers[currentQuestion?.id];

  // Find best variation when answers change
  useEffect(() => {
    if (!isCustomAssessment && template?.variations) {
      const { variationKey } = findBestVariation(template, discoveryAnswers);
      if (variationKey !== matchedVariation) {
        actions.setMatchedVariation(variationKey);
      }
    }
  }, [discoveryAnswers, template, isCustomAssessment, matchedVariation, actions]);

  // Cleanup auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
    };
  }, []);

  // Handle answer selection with auto-advance
  const handleAnswer = useCallback((value) => {
    // Clear any pending auto-advance
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }

    if (isCustomAssessment) {
      actions.setSelfAssessmentAnswer(currentQuestion.id, value);
    } else {
      actions.setDiscoveryAnswer(currentQuestion.id, value);
    }

    // Auto-advance to next question after 400ms (but not on last question)
    const isLastQuestion = currentQuestionIndex >= totalQuestions - 1;
    if (!isLastQuestion) {
      autoAdvanceTimer.current = setTimeout(() => {
        actions.nextDiscoveryQuestion();
      }, 400);
    }
  }, [isCustomAssessment, currentQuestion, currentQuestionIndex, totalQuestions, actions]);

  // Handle next question
  const handleNext = () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }
    if (currentQuestionIndex < totalQuestions - 1) {
      actions.nextDiscoveryQuestion();
    }
  };

  // Handle previous question
  const handlePrev = () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }
    if (currentQuestionIndex > 0) {
      actions.prevDiscoveryQuestion();
    }
  };

  // Get self-assessment feedback
  const getSelfAssessmentFeedback = () => {
    if (!isCustomAssessment || !currentQuestion || !currentAnswer) return null;
    const option = currentQuestion.options.find((o) => o.value === currentAnswer);
    return option ? { riskLevel: option.riskLevel, feedback: option.feedback } : null;
  };

  const assessmentFeedback = getSelfAssessmentFeedback();

  // Answers map for progress dots
  const answersMap = isCustomAssessment
    ? state.templateJourney.selfAssessmentAnswers
    : discoveryAnswers;

  // If no questions, show message and skip button
  if (!questions || questions.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <Text color={helperColor} mb={4}>
          No discovery questions for this template. Continue to customize your settings.
        </Text>
        <Button
          bg="warmGray.900"
          color="white"
          borderRadius="full"
          onClick={onSkip}
          _hover={{ bg: 'warmGray.800' }}
        >
          Continue
        </Button>
      </Box>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      {/* Progress */}
      <ProgressBar
        current={currentQuestionIndex}
        total={totalQuestions}
        answers={answersMap}
        questions={questions}
      />

      {/* Current Question */}
      <QuestionCard
        question={currentQuestion}
        answer={currentAnswer}
        onAnswer={handleAnswer}
        isActive={true}
      />

      {/* Self-Assessment Feedback */}
      {assessmentFeedback && (
        <SelfAssessmentWarning
          riskLevel={assessmentFeedback.riskLevel}
          feedback={assessmentFeedback.feedback}
        />
      )}

      {/* Navigation */}
      <HStack justify="space-between">
        <Button
          leftIcon={<Icon as={PiArrowLeft} />}
          onClick={handlePrev}
          isDisabled={currentQuestionIndex === 0}
          variant="ghost"
          color={navColor}
        >
          Previous
        </Button>

        <HStack spacing={3}>
          <Button variant="ghost" onClick={onSkip} color={skipColor} fontSize="sm">
            Skip Discovery
          </Button>
          {currentQuestionIndex < totalQuestions - 1 ? (
            <Button
              rightIcon={<Icon as={PiArrowRight} />}
              onClick={handleNext}
              bg="warmGray.900"
              color="white"
              borderRadius="full"
              isDisabled={!currentAnswer}
              _hover={{ bg: 'warmGray.800' }}
            >
              Next
            </Button>
          ) : (
            <Button
              bg="warmGray.900"
              color="white"
              borderRadius="full"
              onClick={() => {
                if (isCustomAssessment) {
                  // Reset to show discovery questions
                  actions.setCurrentQuestionIndex(0);
                } else if (onSeeRecommendation) {
                  // Navigate to full recommendation view
                  onSeeRecommendation();
                }
              }}
              isDisabled={!currentAnswer}
              _hover={{ bg: 'warmGray.800' }}
            >
              {isCustomAssessment ? 'Continue to Discovery' : 'See Recommendation'}
            </Button>
          )}
        </HStack>
      </HStack>
    </VStack>
  );
}

export default DiscoveryQuestions;
