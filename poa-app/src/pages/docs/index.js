import { useEffect, useState } from 'react';
import { getSortedPostsData } from '../../util/posts';
import SEOHead from '@/components/common/SEOHead';
import { 
  Flex, 
  Box, 
  Heading, 
  Text, 
  SimpleGrid, 
  useColorModeValue, 
  Icon,
  VStack,
  Container,
  Tag,
  Divider,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import Layout from '../../components/Layout';
import SideBar from '../../components/docs/SideBar';
import { FaBook, FaVoteYea, FaInfoCircle, FaArrowRight, FaUserShield, FaCog, FaNetworkWired } from 'react-icons/fa';
import { motion } from 'framer-motion';
import Link from 'next/link';

// Motion components
const MotionBox = motion(Box);
const MotionFlex = motion(Flex);

export default function Home({ allPostsData }) {
  const [isClient, setIsClient] = useState(false);
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: true });

  // Category colors
  const categoryColors = {
    'Get Started': 'green',
    'Voting': 'purple',
    'Roles & Organization': 'orange',
    'Features': 'blue',
    'Protocol': 'cyan',
    'Blog': 'blue'
  };

  // Card design values
  const cardBg = useColorModeValue('white', 'gray.800');
  const cardBorder = useColorModeValue('gray.200', 'gray.700');
  const headingColor = useColorModeValue('blue.600', 'blue.300');
  const textColor = useColorModeValue('gray.700', 'gray.300');

  // Hero section background
  const heroBg = useColorModeValue('blue.50', 'blue.900');
  const heroGradient = useColorModeValue(
    'linear(to-r, blue.50, purple.50)',
    'linear(to-r, blue.900, purple.900)'
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Custom title mapping
  const customTitles = {
    // Get Started
    'create': 'Creating an Organization',
    'join': 'Joining an Organization',
    'perpetualOrganization': 'What is a Community-Owned Organization?',
    'passkey-onboarding': 'Signing in with a Passkey',
    'deployment-wizard': 'Deployment Wizard Reference',
    // Voting
    'hybridVoting': 'Hybrid Voting',
    'contributionVoting': 'Contribution-Based Voting',
    'directDemocracy': 'Direct Democracy',
    // Roles & Organization
    'roles-and-permissions': 'Roles and Permissions',
    'hats-and-roles': 'Where Roles Live (Under the Hood)',
    'vouching-and-trust': 'Vouching and Trust',
    // Features
    'AlphaV1': 'Alpha V1',
    'TheGraph': 'The Graph',
    'task-manager': 'Task Manager',
    'treasury-management': 'Treasury Management',
    'learn-and-earn': 'Learn and Earn',
    'cashout': 'Cashout: Getting Paid in Real Money',
    // Protocol & Infrastructure
    'protocol': 'Protocol Dashboard',
    'gas-sponsor': 'Gas Sponsorship and the Solidarity Fund',
    'account-abstraction': 'Account Abstraction',
    'cross-chain-architecture': 'Cross-Chain Architecture',
    'white-label-hosting': 'White-Label Hosting',
  };

  // Group posts by category. Order within a category matters — earlier IDs
  // appear first. Anything missing from a category falls back to filtering by
  // post.category from determineCategory() in util/posts.js.
  const orderedFilter = (orderedIds, fallbackCategory) =>
    allPostsData
      .filter(p => orderedIds.includes(p.id) || (fallbackCategory && p.category === fallbackCategory))
      .sort((a, b) => {
        const aIdx = orderedIds.indexOf(a.id);
        const bIdx = orderedIds.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return 0;
      });

  const getStartedPosts = orderedFilter(
    ['perpetualOrganization', 'passkey-onboarding', 'create', 'join', 'deployment-wizard'],
    'Get Started'
  );

  const votingPosts = orderedFilter(
    ['directDemocracy', 'contributionVoting', 'hybridVoting'],
    'Voting'
  );

  const rolesPosts = orderedFilter(
    ['roles-and-permissions', 'vouching-and-trust', 'hats-and-roles'],
    'Roles & Organization'
  );

  const featurePosts = orderedFilter(
    ['task-manager', 'treasury-management', 'learn-and-earn', 'cashout', 'AlphaV1', 'TheGraph'],
    'Features'
  );

  const protocolPosts = orderedFilter(
    ['protocol', 'gas-sponsor', 'account-abstraction', 'cross-chain-architecture', 'white-label-hosting'],
    'Protocol'
  );

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5
      }
    }
  };

  // Render a category section
  const renderCategorySection = (title, posts, icon) => {
    if (posts.length === 0) return null;
    
    return (
      <VStack align="stretch" spacing={6} width="100%" mb={10}>
        <Flex 
          align="center" 
          mb={4} 
          pb={2}
          borderBottomWidth="2px" 
          borderBottomColor={`${categoryColors[title]}.400`}
        >
          <Icon as={icon} mr={3} color={`${categoryColors[title]}.400`} boxSize={7} />
          <Heading 
            size="xl" 
            color="white" 
            fontWeight="bold" 
            letterSpacing="tight"
          >
            {title}
          </Heading>
        </Flex>
        
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
          {posts.map(({ id, date, title, description }) => (
            <Link href={`/docs/${id}`} key={id} passHref>
              <MotionBox
                variants={itemVariants}
                whileHover={{ 
                  y: -5, 
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}
                as="a"
                display="flex"
                flexDir="column"
                height="100%"
                p={6}
                borderWidth="1px"
                borderRadius="xl"
                bg="white"
                borderColor="#e2d6ca"
                boxShadow="sm"
                transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
                position="relative"
                overflow="hidden"
                _before={{
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '4px',
                  bg: categoryColors[title] ? `${categoryColors[title]}.500` : 'blue.500'
                }}
              >
                <Heading size="md" mb={2} fontWeight="bold">
                  {customTitles[id] || title}
                </Heading>
                
                {description && (
                  <Text color="gray.600" mb={4} flex="1">
                    {description}
                  </Text>
                )}
                
                <Flex 
                  mt="auto"
                  align="center" 
                  color={`${categoryColors[title] || 'blue'}.500`}
                  fontWeight="medium"
                >
                  Read more <Icon as={FaArrowRight} ml={1} fontSize="xs" />
                </Flex>
              </MotionBox>
            </Link>
          ))}
        </SimpleGrid>
      </VStack>
    );
  };

  const sectionLabel = (title, icon, accent) => (
    <Flex align="center" mb={6} mt={10} _first={{ mt: 6 }}>
      <Box bg="rgba(0, 0, 0, 0.7)" p={2} borderRadius="md" mr={3}>
        <Icon as={icon} color={`${accent}.300`} boxSize={5} />
      </Box>
      <Heading as="h2" size="lg" color="black" fontWeight="bold">
        {title}
      </Heading>
    </Flex>
  );

  const renderSection = (title, icon, accent, posts) => {
    if (!posts || posts.length === 0) return null;
    return (
      <>
        {sectionLabel(title, icon, accent)}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
          {posts.map(post => (
            <Link href={`/docs/${post.id}`} key={post.id} passHref>
              <MotionBox
                variants={itemVariants}
                whileHover={{
                  y: -5,
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}
                as="a"
                display="flex"
                flexDir="column"
                height="100%"
                p={6}
                borderWidth="1px"
                borderRadius="xl"
                bg="white"
                borderColor="#e2d6ca"
                boxShadow="sm"
                transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
                position="relative"
                overflow="hidden"
                _before={{
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '4px',
                  bg: `${accent}.500`,
                }}
              >
                <Heading as="h3" size="md" mb={2} fontWeight="bold">
                  {customTitles[post.id] || post.title}
                </Heading>
                {post.description && (
                  <Text color="gray.600" mb={4} flex="1">
                    {post.description}
                  </Text>
                )}
                <Flex mt="auto" align="center" color={`${accent}.500`} fontWeight="medium">
                  Read more <Icon as={FaArrowRight} ml={1} fontSize="xs" />
                </Flex>
              </MotionBox>
            </Link>
          ))}
        </SimpleGrid>
      </>
    );
  };

  return (
    <>
    <SEOHead
      title="Poa Documentation. Setup, Governance, and Voting Guides."
      description="Guides for creating, governing, and joining community-owned organizations on poa.box. Voting models (direct democracy, contribution-based, hybrid), treasury management, role permissions, and protocol reference."
      path="/docs"
      keywords={[
        "DAO documentation",
        "DAO setup guide",
        "no-code DAO",
        "governance models",
        "hybrid voting",
        "contribution-based voting",
        "direct democracy voting",
        "community-owned organization",
        "poa.box",
      ]}
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Poa Documentation",
        "description":
          "Documentation for creating, governing, and joining community-owned DAOs on poa.box.",
        "url": "https://poa.box/docs/",
        "inLanguage": "en",
        "isPartOf": { "@type": "WebSite", "name": "Poa", "url": "https://poa.box" },
      }}
    />
    <Layout>
      <Box>
        {isClient && (
          <Flex direction={{ base: 'column', md: 'row' }} maxWidth="1400px" mx="auto">
            <Box display={{ base: 'none', md: 'block' }}>
              <SideBar />
            </Box>
            
            <Box flex="1" px={{ base: 4, md: 8 }} pt={{ base: 4, md: 4 }} pb={10}>
              {/* Hero Section */}
              <MotionFlex
                direction="column"
                align="center"
                justify="center"
                textAlign="center"
                bg="rgba(0, 0, 0, 0.88)"
                borderRadius="xl"
                p={{ base: 8, md: 12 }}
                mb={12}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                boxShadow="md"
                borderWidth="1px"
                borderColor="rgba(255, 255, 255, 0.1)"
              >
                <Heading
                  as="h1"
                  size="2xl"
                  mb={4}
                  color="white"
                  fontWeight="extrabold"
                  letterSpacing="tight"
                >
                  Poa Documentation
                </Heading>
                <Text
                  fontSize="xl"
                  maxW="3xl"
                  color="gray.300"
                  mb={6}
                >
                  Guides for creating, governing, and joining community-owned organizations on poa.box. Voting models, treasury management, role permissions, and protocol reference.
                </Text>
                <Flex gap={4} wrap="wrap" justify="center">
                  <Link href="/docs/create" passHref>
                    <Button
                      colorScheme="blue"
                      size="lg"
                      leftIcon={<Icon as={FaBook} />}
                    >
                      Get Started
                    </Button>
                  </Link>
                  <Link href="/docs/hybridVoting" passHref>
                    <Button
                      variant="outline"
                      size="lg"
                      leftIcon={<Icon as={FaVoteYea} />}
                      bg="transparent"
                      color="white"
                      borderColor="white"
                      _hover={{ bg: "whiteAlpha.200" }}
                    >
                      Learn about Voting
                    </Button>
                  </Link>
                </Flex>
              </MotionFlex>
              
              <Container maxW="container.xl" p={0}>
                <MotionBox
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {renderSection('Get Started', FaBook, 'green', getStartedPosts)}
                  {renderSection('Voting', FaVoteYea, 'purple', votingPosts)}
                  {renderSection('Roles & Organization', FaUserShield, 'orange', rolesPosts)}
                  {renderSection('Features', FaInfoCircle, 'blue', featurePosts)}
                  {renderSection('Protocol & Infrastructure', FaNetworkWired, 'cyan', protocolPosts)}
                </MotionBox>
              </Container>
            </Box>
          </Flex>
        )}
      </Box>
    </Layout>
    </>
  );
}

export async function getStaticProps() {
  const allPostsData = getSortedPostsData();
  return {
    props: {
      allPostsData
    }
  };
}
