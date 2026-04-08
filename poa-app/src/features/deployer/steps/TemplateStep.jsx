/**
 * TemplateStep - Rich template selection and discovery flow
 *
 * The first step in the new deployer flow. Users choose from curated templates,
 * answer discovery questions to personalize settings, and learn about the
 * governance philosophy behind their choice.
 *
 * Flow:
 * 1. Template Gallery - Choose your organization type
 * 2. Philosophy Overview - Learn why this governance model works
 * 3. Discovery Questions - Personalize settings for your context
 * 4. Growth Path Preview - See how governance evolves
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  SimpleGrid,
  Card,
  CardBody,
  Button,
  Icon,
  useColorModeValue,
  Flex,
  Collapse,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import {
  PiCheck,
  PiArrowRight,
  PiArrowLeft,
  PiUsersThree,
  PiCoins,
  PiEye,
  PiGitMerge,
  PiPath,
  PiHandshake,
  PiPalette,
  PiSparkle,
  PiMegaphone,
  PiUsers,
  PiGlobe,
  PiChalkboardTeacher,
  PiTrophy,
  PiSliders,
  PiPuzzlePiece,
  PiWrench,
  PiGear,
  PiBookOpen,
  PiKanban,
  PiUserPlus,
  PiRocket,
  PiCertificate,
  PiX,
  PiLightbulb,
  PiScales,
  PiShieldCheck,
  PiTreeStructure,
} from 'react-icons/pi';
import { useDeployer } from '../context/DeployerContext';
import {
  RICH_TEMPLATE_LIST as TEMPLATE_LIST,
  getRichTemplateById as getTemplateById,
} from '../templates';
import { DiscoveryQuestions, GrowthPathVisualizer } from '../components/governance';
import { RecommendationView } from '../components/governance/RecommendationView';

// View states for the template step
const VIEWS = {
  GALLERY: 'gallery',
  PHILOSOPHY: 'philosophy',
  DISCOVERY: 'discovery',
  RECOMMENDATION: 'recommendation',
  PREVIEW: 'preview',
};

// Icon mapping for benefit cards (Phosphor Icons)
const ICON_MAP = {
  UsersThree: PiUsersThree,
  Coins: PiCoins,
  Eye: PiEye,
  GitMerge: PiGitMerge,
  Path: PiPath,
  Handshake: PiHandshake,
  Palette: PiPalette,
  Sparkle: PiSparkle,
  Megaphone: PiMegaphone,
  Users: PiUsers,
  Globe: PiGlobe,
  Chalkboard: PiChalkboardTeacher,
  Trophy: PiTrophy,
  Sliders: PiSliders,
  PuzzlePiece: PiPuzzlePiece,
  Wrench: PiWrench,
  Gear: PiGear,
  BookOpen: PiBookOpen,
  Kanban: PiKanban,
  UserPlus: PiUserPlus,
  Rocket: PiRocket,
  Certificate: PiCertificate,
  Lightbulb: PiLightbulb,
  Scales: PiScales,
  ShieldCheck: PiShieldCheck,
  TreeStructure: PiTreeStructure,
};

/**
 * Single expandable feature card
 */
function ExpandableFeatureCard({ benefit, isExpanded, onToggle, votingData }) {
  const [isHovered, setIsHovered] = useState(false);
  const cardBg = useColorModeValue('white', 'warmGray.800');
  const titleColor = useColorModeValue('warmGray.800', 'white');
  const subtitleColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const contentColor = useColorModeValue('warmGray.700', 'warmGray.200');
  const iconColor = useColorModeValue('amethyst.500', 'amethyst.400');
  const hintColor = useColorModeValue('amethyst.500', 'amethyst.400');

  const IconComponent = ICON_MAP[benefit.iconName] || PiCheck;
  const isVotingCard = benefit.title === 'Decide Together';

  if (isExpanded) {
    // Expanded state - full width card with details
    return (
      <Box
        bg={cardBg}
        p={8}
        borderRadius="xl"
        boxShadow="lg"
        transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
        gridColumn="1 / -1"
      >
        <Flex justify="space-between" align="flex-start" mb={5}>
          <HStack spacing={4}>
            <Icon as={IconComponent} boxSize={12} color={iconColor} />
            <Box>
              <Text fontWeight="700" fontSize="2xl" color={titleColor}>
                {benefit.title}
              </Text>
              {benefit.subtitle && (
                <Text fontSize="lg" color={subtitleColor}>
                  {benefit.subtitle}
                </Text>
              )}
            </Box>
          </HStack>
          <Button
            variant="ghost"
            size="md"
            onClick={onToggle}
            color={subtitleColor}
            _hover={{ color: titleColor, bg: 'warmGray.100' }}
            p={2}
          >
            <Icon as={PiX} boxSize={6} />
          </Button>
        </Flex>

        {/* Show voting bar for the Decide Together card */}
        {isVotingCard && votingData && (
          <Box mb={5}>
            <VotingBalanceBar
              democracy={votingData.democracyWeight}
              participation={votingData.participationWeight}
            />
          </Box>
        )}

        <Text fontSize="lg" color={contentColor} lineHeight="1.8">
          {benefit.expandedContent || benefit.outcome}
        </Text>
      </Box>
    );
  }

  // Collapsed state - compact card
  return (
    <Box
      bg={cardBg}
      p={5}
      borderRadius="lg"
      boxShadow="sm"
      cursor="pointer"
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      border="1px solid"
      borderColor={isHovered ? 'amethyst.200' : 'warmGray.100'}
      transition="transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease"
      _hover={{
        transform: 'translateY(-2px)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
      }}
      textAlign="center"
      position="relative"
    >
      <Icon as={IconComponent} boxSize={10} color={iconColor} mb={3} />
      <Text fontWeight="700" fontSize="lg" color={titleColor} mb={1}>
        {benefit.title}
      </Text>
      {benefit.subtitle && (
        <Text fontSize="sm" color={subtitleColor}>
          {benefit.subtitle}
        </Text>
      )}
      {/* Show hint only on hover */}
      <Text
        fontSize="sm"
        color={hintColor}
        mt={3}
        fontWeight="500"
        opacity={isHovered ? 1 : 0}
        transition="opacity 0.2s ease"
      >
        Click to learn more
      </Text>
    </Box>
  );
}

/**
 * Grid of 4 expandable feature cards
 */
function FeatureCardsGrid({ benefits, votingData }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!benefits || benefits.length === 0) return null;

  const handleToggle = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  // If a card is expanded, show it first at full width, then others below
  if (expandedIndex !== null) {
    const expandedBenefit = benefits[expandedIndex];
    const otherBenefits = benefits.filter((_, i) => i !== expandedIndex);

    return (
      <VStack spacing={4} align="stretch">
        <ExpandableFeatureCard
          benefit={expandedBenefit}
          isExpanded={true}
          onToggle={() => handleToggle(expandedIndex)}
          votingData={votingData}
        />
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
          {otherBenefits.map((benefit, i) => {
            const originalIndex = benefits.indexOf(benefit);
            return (
              <ExpandableFeatureCard
                key={originalIndex}
                benefit={benefit}
                isExpanded={false}
                onToggle={() => handleToggle(originalIndex)}
                votingData={votingData}
              />
            );
          })}
        </SimpleGrid>
      </VStack>
    );
  }

  // Default grid view - all cards collapsed
  return (
    <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
      {benefits.map((benefit, i) => (
        <ExpandableFeatureCard
          key={i}
          benefit={benefit}
          isExpanded={false}
          onToggle={() => handleToggle(i)}
          votingData={votingData}
        />
      ))}
    </SimpleGrid>
  );
}

/**
 * Social proof banner showing real-world credibility
 */
function SocialProof({ text }) {
  const textColor = useColorModeValue('warmGray.400', 'warmGray.500');

  if (!text) return null;

  return (
    <Text
      fontSize="sm"
      color={textColor}
      fontStyle="italic"
      textAlign="center"
      letterSpacing="0.01em"
    >
      {text}
    </Text>
  );
}

/**
 * Visual bar showing democracy/participation voting split (for governance details)
 */
function VotingBalanceBar({ democracy, participation }) {
  const democracyBg = useColorModeValue('blue.400', 'blue.500');
  const participationBg = useColorModeValue('amethyst.400', 'amethyst.500');
  const labelColor = useColorModeValue('warmGray.600', 'warmGray.400');

  return (
    <Box my={4}>
      <Box
        h="36px"
        borderRadius="full"
        overflow="hidden"
        display="flex"
        bg={useColorModeValue('warmGray.100', 'warmGray.700')}
      >
        <Flex
          w={`${democracy}%`}
          bg={democracyBg}
          align="center"
          justify="center"
          color="white"
          transition="width 0.3s ease"
        >
          <Text fontWeight="600" fontSize="sm">{democracy}%</Text>
        </Flex>
        <Flex
          w={`${participation}%`}
          bg={participationBg}
          align="center"
          justify="center"
          color="white"
          transition="width 0.3s ease"
        >
          <Text fontWeight="600" fontSize="sm">{participation}%</Text>
        </Flex>
      </Box>
      <HStack justify="space-between" mt={2} px={1}>
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg={democracyBg} />
          <Text fontSize="xs" color={labelColor}>Direct democracy</Text>
        </HStack>
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg={participationBg} />
          <Text fontSize="xs" color={labelColor}>Contribution</Text>
        </HStack>
      </HStack>
      <Text fontSize="xs" color={labelColor} mt={3} lineHeight="tall">
        {democracy}% of voting power is shared equally: every member gets an equal say.
        The remaining {participation}% is earned through contribution, so active participants
        carry more influence.
      </Text>
    </Box>
  );
}

/**
 * Template card in the gallery - cleaner, centered design
 */
function TemplateCard({ template, isSelected, onSelect }) {
  const borderColor = useColorModeValue('warmGray.200', 'warmGray.600');
  const selectedBorderColor = useColorModeValue('amethyst.500', 'amethyst.400');
  const hoverBorderColor = useColorModeValue('amethyst.300', 'amethyst.500');
  const cardBg = useColorModeValue('white', 'rgba(51, 48, 44, 0.7)');
  const selectedBg = useColorModeValue('amethyst.50', 'rgba(144, 85, 232, 0.08)');
  const helperColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const iconBg = useColorModeValue('warmGray.50', 'warmGray.700');

  const icon = template.icon || '📋';

  return (
    <Card
      cursor="pointer"
      onClick={() => onSelect(template.id)}
      borderWidth="2px"
      borderColor={isSelected ? selectedBorderColor : borderColor}
      bg={isSelected ? selectedBg : cardBg}
      _hover={{
        borderColor: isSelected ? selectedBorderColor : hoverBorderColor,
        transform: 'translateY(-2px)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
      }}
      transition="transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease"
      h="100%"
      position="relative"
      overflow="hidden"
    >
      {/* Selected indicator bar */}
      {isSelected && (
        <Box
          position="absolute"
          top="0"
          left="0"
          right="0"
          h="3px"
          bgGradient="linear(90deg, #9055E8, #E85D85)"
        />
      )}

      <CardBody py={6}>
        <VStack spacing={4}>
          {/* Centered Icon */}
          <Box
            bg={iconBg}
            w="56px"
            h="56px"
            borderRadius="xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="2xl">{icon}</Text>
          </Box>

          {/* Title & Tagline - Centered */}
          <Box textAlign="center">
            <Heading size="sm" mb={2} color={isSelected ? 'amethyst.700' : 'warmGray.800'}>
              {template.name}
            </Heading>
            <Text fontSize="sm" color={helperColor} lineHeight="tall">
              {template.tagline}
            </Text>
          </Box>

          {/* Selected check */}
          {isSelected && (
            <Box
              position="absolute"
              top={3}
              right={3}
              bgGradient="linear(135deg, #9055E8, #E85D85)"
              borderRadius="full"
              w="24px"
              h="24px"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Icon as={PiCheck} color="white" boxSize={3} />
            </Box>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
}

/**
 * Template Detail Panel - "Invitation" design
 * Leads with aspiration, not mechanism
 */
function TemplateDetailPanel({ template, onContinue, onBack, onOpenGrowthPath }) {
  const [showGrowthPath, setShowGrowthPath] = useState(false);
  const [showPhilosophy, setShowPhilosophy] = useState(false);

  const headingColor = useColorModeValue('warmGray.900', 'white');
  const subheadingColor = useColorModeValue('warmGray.600', 'warmGray.400');
  const linkColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const linkHoverColor = useColorModeValue('amethyst.500', 'amethyst.400');
  const detailsBg = useColorModeValue('warmGray.50', 'warmGray.800');
  const quoteBg = useColorModeValue('amethyst.50', 'amethyst.900');

  if (!template) {
    return (
      <VStack spacing={4}>
        <Text color={subheadingColor}>No template selected.</Text>
        <Button bg="warmGray.900" color="white" borderRadius="full" _hover={{ bg: 'warmGray.800' }} onClick={onBack}>
          Back to Templates
        </Button>
      </VStack>
    );
  }

  const { essence, keyPrinciple, historicalContext } = template.philosophy || {};
  const heroTagline = template.heroTagline || [];
  const benefits = template.benefits || [];
  const socialProof = template.socialProof;
  const hasGrowthPath = template.growthPath?.stages?.length > 0;
  const votingData = template.defaults?.voting;

  return (
    <VStack spacing={10} align="stretch" maxW="900px" mx="auto">
      {/* Back Button */}
      <Button
        variant="ghost"
        leftIcon={<Icon as={PiArrowLeft} />}
        onClick={onBack}
        alignSelf="flex-start"
        size="sm"
        color={subheadingColor}
        _hover={{ color: headingColor }}
      >
        Back to Templates
      </Button>

      {/* Template Header */}
      <VStack spacing={3} textAlign="center">
        <Heading size="2xl" color={headingColor} letterSpacing="-0.02em">
          {template.name}
        </Heading>
        <Text color={subheadingColor} fontSize="lg" fontWeight="500">
          {template.tagline}
        </Text>
      </VStack>

      {/* Hero Tagline */}
      {heroTagline.length > 0 && (
        <VStack spacing={1} textAlign="center" py={4}>
          {heroTagline.map((line, i) => (
            <Text
              key={i}
              fontSize={["xl", "2xl", "3xl"]}
              fontWeight="600"
              lineHeight="tall"
              letterSpacing="-0.01em"
              bgGradient="linear(135deg, #7C3AED, #A855F7, #EC4899)"
              bgClip="text"
            >
              {line}
            </Text>
          ))}
        </VStack>
      )}

      {/* Social Proof - subtle context below tagline */}
      <SocialProof text={socialProof} />

      {/* Feature Cards - Expandable */}
      <FeatureCardsGrid benefits={benefits} votingData={votingData} />

      {/* Primary CTA */}
      <Box textAlign="center" pt={4}>
        <Button
          bg="warmGray.900"
          color="white"
          borderRadius="full"
          _hover={{ bg: 'warmGray.800', transform: 'translateY(-1px)' }}
          _active={{ bg: 'warmGray.700' }}
          size="lg"
          rightIcon={<Icon as={PiArrowRight} />}
          onClick={onContinue}
          px={8}
          py={6}
          fontSize="md"
          fontWeight="600"
          boxShadow="md"
          transition="transform 0.2s ease, background 0.2s ease"
        >
          Customize This Model
        </Button>
      </Box>

      {/* Optional Details Links */}
      <HStack justify="center" spacing={6} pt={2}>
        {hasGrowthPath && (
          <>
            <Button
              variant="link"
              size="sm"
              color={linkColor}
              _hover={{ color: linkHoverColor }}
              leftIcon={<Icon as={PiTreeStructure} />}
              onClick={() => setShowGrowthPath(!showGrowthPath)}
            >
              View growth path
            </Button>
            <Text color={subheadingColor}>·</Text>
          </>
        )}
        <Button
          variant="link"
          size="sm"
          color={linkColor}
          _hover={{ color: linkHoverColor }}
          leftIcon={<Icon as={PiBookOpen} />}
          onClick={() => setShowPhilosophy(!showPhilosophy)}
        >
          The philosophy
        </Button>
      </HStack>

      {/* Growth Path Collapse */}
      {hasGrowthPath && (
        <Collapse in={showGrowthPath} animateOpacity>
          <Box bg={detailsBg} p={5} borderRadius="lg" mt={2}>
            <GrowthPathVisualizer template={template} />
          </Box>
        </Collapse>
      )}

      {/* Philosophy Details Collapse */}
      <Collapse in={showPhilosophy} animateOpacity>
        <Box bg={detailsBg} p={5} borderRadius="lg" mt={2}>
          <VStack spacing={4} align="stretch">
            <Heading size="sm" color={headingColor}>The Philosophy</Heading>
            {essence && (
              <Text fontSize="sm" color={subheadingColor} whiteSpace="pre-line">
                {essence}
              </Text>
            )}
            {keyPrinciple && (
              <Box bg={quoteBg} p={4} borderRadius="md" borderLeftWidth="3px" borderLeftColor="amethyst.500">
                <Text fontWeight="medium" fontSize="sm" mb={1}>Key Insight</Text>
                <Text fontStyle="italic" fontSize="sm">{keyPrinciple}</Text>
              </Box>
            )}
            {historicalContext && (
              <Box>
                <Text fontWeight="medium" fontSize="sm" mb={1} color={subheadingColor}>
                  Historical Context
                </Text>
                <Text fontSize="sm" color={subheadingColor}>
                  {historicalContext}
                </Text>
              </Box>
            )}
          </VStack>
        </Box>
      </Collapse>
    </VStack>
  );
}

// Keep PhilosophyPanel as alias for backward compatibility
const PhilosophyPanel = TemplateDetailPanel;

/**
 * Growth path preview in a modal
 */
function GrowthPathModal({ template, isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing={2}>
            <Text>{template?.icon}</Text>
            <Text>Growth Path: {template?.name}</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {template && <GrowthPathVisualizer template={template} />}
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * Main TemplateStep component
 */
export function TemplateStep() {
  const { state, actions } = useDeployer();
  const [currentView, setCurrentView] = useState(VIEWS.GALLERY);

  const {
    isOpen: isGrowthPathOpen,
    onOpen: openGrowthPath,
    onClose: closeGrowthPath,
  } = useDisclosure();

  const selectedTemplateId = state.ui.selectedTemplate;
  const selectedTemplate = useMemo(
    () => selectedTemplateId ? getTemplateById(selectedTemplateId) : null,
    [selectedTemplateId]
  );

  const headingColor = useColorModeValue('warmGray.900', 'white');
  const subheadingColor = useColorModeValue('warmGray.600', 'warmGray.400');

  // Handle template selection - auto-navigate to detail view
  const handleSelectTemplate = (templateId) => {
    actions.selectTemplate(templateId);
    actions.resetTemplateJourney();
    // Auto-navigate to philosophy/detail view
    setCurrentView(VIEWS.PHILOSOPHY);
  };

  // Handle continue from philosophy view
  const handleContinueFromPhilosophy = () => {
    if (selectedTemplate?.discoveryQuestions?.length > 0) {
      setCurrentView(VIEWS.DISCOVERY);
    } else {
      handleFinishTemplateStep();
    }
  };

  // Handle skip discovery
  const handleSkipDiscovery = () => {
    handleFinishTemplateStep();
  };

  // Handle "See Recommendation" from discovery
  const handleSeeRecommendation = () => {
    const matchedVar = state.templateJourney.matchedVariation;
    if (matchedVar && selectedTemplate?.variations?.[matchedVar]) {
      setCurrentView(VIEWS.RECOMMENDATION);
    } else {
      // No variation matched — skip recommendation, go straight to next step
      handleFinishTemplateStep();
    }
  };

  // Handle confirm variation from recommendation view
  const handleConfirmVariation = () => {
    const variation = selectedTemplate?.variations?.[state.templateJourney.matchedVariation];
    if (variation) {
      actions.applyVariation(variation, selectedTemplate);
    }
    handleFinishTemplateStep();
  };

  // Handle customize from recommendation view (apply defaults then let user edit)
  const handleCustomizeVariation = () => {
    const variation = selectedTemplate?.variations?.[state.templateJourney.matchedVariation];
    if (variation) {
      actions.applyVariation(variation, selectedTemplate);
    }
    handleFinishTemplateStep();
  };

  // Finish template step and move to next
  const handleFinishTemplateStep = () => {
    if (selectedTemplateId) {
      // Apply base template first
      actions.applyTemplate(selectedTemplateId);

      // Re-apply variation if one was confirmed (to restore variation settings)
      // This fixes the bug where applyTemplate() would overwrite variation settings
      if (state.templateJourney.variationConfirmed && state.templateJourney.matchedVariation) {
        const template = getTemplateById(selectedTemplateId);
        const variation = template?.variations?.[state.templateJourney.matchedVariation];
        if (variation) {
          actions.applyVariation(variation, template);
        }
      }

      actions.nextStep();
    }
  };

  // Handle back to gallery
  const handleBackToGallery = () => {
    setCurrentView(VIEWS.GALLERY);
  };

  // Render based on current view
  const renderView = () => {
    switch (currentView) {
      case VIEWS.PHILOSOPHY:
        return (
          <PhilosophyPanel
            template={selectedTemplate}
            onContinue={handleContinueFromPhilosophy}
            onBack={handleBackToGallery}
          />
        );

      case VIEWS.DISCOVERY:
        return (
          <VStack spacing={6} align="stretch">
            <Button
              variant="ghost"
              leftIcon={<Icon as={PiArrowLeft} />}
              onClick={() => setCurrentView(VIEWS.PHILOSOPHY)}
              alignSelf="flex-start"
            >
              Back to Philosophy
            </Button>

            <HStack spacing={3}>
              <Text fontSize="2xl">{selectedTemplate?.icon}</Text>
              <Box>
                <Heading size="md">{selectedTemplate?.name}</Heading>
                <Text color={subheadingColor}>Tell us about your organization</Text>
              </Box>
            </HStack>

            <DiscoveryQuestions
              template={selectedTemplate}
              onSkip={handleSkipDiscovery}
              onSeeRecommendation={handleSeeRecommendation}
            />

            {/* Growth Path Preview Link */}
            {selectedTemplate?.growthPath?.stages?.length > 0 && (
              <Box textAlign="center" pt={4}>
                <Button
                  variant="link"
                  color="amethyst.500"
                  _hover={{ color: 'amethyst.600' }}
                  onClick={openGrowthPath}
                >
                  See how governance evolves over time
                </Button>
              </Box>
            )}
          </VStack>
        );

      case VIEWS.RECOMMENDATION:
        return (
          <RecommendationView
            template={selectedTemplate}
            variation={selectedTemplate?.variations?.[state.templateJourney.matchedVariation]}
            variationKey={state.templateJourney.matchedVariation}
            onConfirm={handleConfirmVariation}
            onCustomize={handleCustomizeVariation}
            onBack={() => setCurrentView(VIEWS.DISCOVERY)}
          />
        );

      case VIEWS.GALLERY:
      default:
        return (
          <VStack spacing={10} align="stretch">
            {/* Header */}
            <Box textAlign="center" mb={2}>
              <Heading size="lg" color={headingColor} mb={3}>
                What kind of organization will you create together?
              </Heading>
              <Text color={subheadingColor} maxW="600px" mx="auto" fontSize="md" lineHeight="tall">
                Every community is different. These templates give you a starting point
                that matches how your group already works, then grows with you.
              </Text>
            </Box>

            {/* Template Grid - clicking a card auto-navigates to detail view */}
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={5}>
              {TEMPLATE_LIST.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateId === template.id}
                  onSelect={handleSelectTemplate}
                />
              ))}
            </SimpleGrid>
          </VStack>
        );
    }
  };

  return (
    <>
      {renderView()}

      {/* Growth Path Modal */}
      <GrowthPathModal
        template={selectedTemplate}
        isOpen={isGrowthPathOpen}
        onClose={closeGrowthPath}
      />
    </>
  );
}

export default TemplateStep;
