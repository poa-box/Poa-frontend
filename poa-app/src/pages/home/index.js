import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  VStack,
  Image,
  HStack,
  Icon,
  SimpleGrid,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { FaLink, FaUsers, FaSearch, FaArrowRight, FaExternalLinkAlt } from "react-icons/fa";
import { FiUsers, FiActivity, FiCheckCircle } from "react-icons/fi";
import Link from "next/link";
import { usePOContext } from "@/context/POContext";
import { useIPFScontext } from "@/context/ipfsContext";
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";

// Same gradient generator as the explore/browser page
const getOrgGradient = (name) => {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = (hash * 16777619) | 0;
  }
  const colors = [
    ["#9055E8", "#E85D85"],
    ["#E85D85", "#F06543"],
    ["#6366F1", "#06B6D4"],
    ["#F06543", "#FACC15"],
    ["#7C3AED", "#3B82F6"],
    ["#EC4899", "#F06543"],
    ["#06B6D4", "#9055E8"],
    ["#3B82F6", "#6366F1"],
  ];
  const angles = [135, 150, 120, 160, 140, 125, 155, 130];
  const idx = Math.abs(hash) % colors.length;
  const angle = angles[Math.abs(hash >> 4) % angles.length];
  return `linear-gradient(${angle}deg, ${colors[idx][0]} 0%, ${colors[idx][1]} 100%)`;
};

const AVATAR_SIZE = { base: "140px", md: "180px" };

const cardStyle = {
  bg: "rgba(255, 255, 255, 0.04)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "2xl",
};

const GradientAvatar = ({ name, orgGradient }) => (
  <Flex
    w={AVATAR_SIZE}
    h={AVATAR_SIZE}
    borderRadius="2xl"
    background={orgGradient}
    align="center"
    justify="center"
    boxShadow="0 8px 32px rgba(0, 0, 0, 0.25)"
  >
    <Text
      fontSize={{ base: "5xl", md: "6xl" }}
      fontWeight="700"
      color="white"
      textTransform="uppercase"
      userSelect="none"
    >
      {name ? name.charAt(0) : ""}
    </Text>
  </Flex>
);

const Home = () => {
  const { logoUrl, poDescription, poLinks, poMembers, activeTaskAmount, completedTaskAmount } = usePOContext();
  const router = useRouter();
  const { userDAO } = router.query;
  const { fetchImageFromIpfs } = useIPFScontext();

  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [isNavbarReady, setIsNavbarReady] = useState(false);

  useEffect(() => {
    if (userDAO) setIsNavbarReady(true);
  }, [userDAO]);

  useEffect(() => {
    const fetchImage = async () => {
      if (logoUrl) {
        try {
          const imageUrl = await fetchImageFromIpfs(logoUrl);
          setImage(imageUrl);
        } catch {
          setImageError(true);
        }
      }
    };
    fetchImage();
  }, [logoUrl]);

  const orgGradient = userDAO ? getOrgGradient(userDAO) : "linear-gradient(135deg, #9055E8, #E85D85)";
  const showImage = image && !imageError;
  const hasLinks = Array.isArray(poLinks) && poLinks.length > 0;

  return (
    <>
      {isNavbarReady && <Navbar userDAO={userDAO} />}

      {/* Page background */}
      <Box
        position="fixed"
        top={0}
        left={0}
        right={0}
        bottom={0}
        bg="#2b2b33"
        zIndex={-2}
      />

      {/* Ambient glow from org gradient */}
      <Box
        position="fixed"
        top="-5%"
        left="50%"
        transform="translateX(-50%)"
        w={{ base: "600px", md: "900px" }}
        h={{ base: "600px", md: "800px" }}
        background={orgGradient}
        opacity={0.12}
        filter="blur(120px)"
        pointerEvents="none"
        borderRadius="50%"
        zIndex={-1}
      />

      <Box
        pt={{ base: "100px", md: "120px" }}
        pb={{ base: 12, md: 20 }}
        position="relative"
        minH="100vh"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        zIndex={1}
      >
        <VStack
          spacing={{ base: 6, md: 8 }}
          w="100%"
          px={4}
          maxW="640px"
          mx="auto"
        >
          {/* Avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            {showImage ? (
              <Box
                w={AVATAR_SIZE}
                h={AVATAR_SIZE}
                borderRadius="2xl"
                overflow="hidden"
                boxShadow="0 8px 32px rgba(0, 0, 0, 0.25)"
              >
                <Image
                  src={image}
                  alt="Organization Logo"
                  w="100%"
                  h="100%"
                  objectFit="cover"
                  onError={() => setImageError(true)}
                />
              </Box>
            ) : (
              <GradientAvatar name={userDAO} orgGradient={orgGradient} />
            )}
          </motion.div>

          {/* Org name and description */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            style={{ width: "100%", textAlign: "center" }}
          >
            <Heading
              as="h1"
              fontSize={{ base: "3xl", md: "4xl" }}
              color="white"
              fontWeight="700"
              letterSpacing="-0.02em"
              mb={3}
            >
              {userDAO || ""}
            </Heading>

            {poDescription && (
              <Text
                fontSize={{ base: "md", md: "lg" }}
                color="whiteAlpha.700"
                lineHeight="1.7"
                fontWeight="500"
                maxW="480px"
                mx="auto"
              >
                {poDescription}
              </Text>
            )}
          </motion.div>

          {/* Stats Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            style={{ width: "100%" }}
          >
            <Box {...cardStyle} p={{ base: 4, md: 6 }}>
              <SimpleGrid columns={3} spacing={{ base: 2, md: 4 }}>
                {[
                  { icon: FiUsers, value: poMembers || "0", label: "Members", color: "purple.300" },
                  { icon: FiActivity, value: activeTaskAmount || "0", label: "Active Tasks", color: "blue.300" },
                  { icon: FiCheckCircle, value: completedTaskAmount || "0", label: "Completed", color: "green.300" },
                ].map((stat) => (
                  <VStack key={stat.label} spacing={1}>
                    <Icon as={stat.icon} color={stat.color} boxSize={{ base: 4, md: 5 }} />
                    <Text
                      fontSize={{ base: "xl", md: "2xl" }}
                      fontWeight="700"
                      color="white"
                    >
                      {stat.value}
                    </Text>
                    <Text
                      fontSize="xs"
                      color="whiteAlpha.500"
                      fontWeight="500"
                    >
                      {stat.label}
                    </Text>
                  </VStack>
                ))}
              </SimpleGrid>
            </Box>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Link href={`/user/?userDAO=${userDAO}`} passHref legacyBehavior>
              <Button
                as="a"
                size="lg"
                bg="white"
                color="gray.900"
                borderRadius="full"
                fontWeight="600"
                px={8}
                rightIcon={<Icon as={FaArrowRight} boxSize={3} />}
                _hover={{
                  transform: "translateY(-1px)",
                  boxShadow: "0 4px 24px rgba(255, 255, 255, 0.15)",
                }}
                _active={{
                  transform: "translateY(0)",
                }}
                transition="all 0.2s ease"
              >
                Join or Sign In
              </Button>
            </Link>
          </motion.div>

          {/* Org Links */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <HStack spacing={2} wrap="wrap" justify="center">
              {hasLinks ? (
                poLinks.map((link, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant="ghost"
                    color="whiteAlpha.600"
                    _hover={{ color: "white", bg: "whiteAlpha.100" }}
                    leftIcon={<Icon as={FaExternalLinkAlt} boxSize={3} />}
                    fontWeight="500"
                    borderRadius="full"
                    onClick={() => window.open(link.url, "_blank")}
                  >
                    {link.name}
                  </Button>
                ))
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="whiteAlpha.600"
                    _hover={{ color: "white", bg: "whiteAlpha.100" }}
                    leftIcon={<Icon as={FaExternalLinkAlt} boxSize={3} />}
                    fontWeight="500"
                    borderRadius="full"
                    onClick={() => window.open("https://poa.community", "_blank")}
                  >
                    Website
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="whiteAlpha.600"
                    _hover={{ color: "white", bg: "whiteAlpha.100" }}
                    leftIcon={<Icon as={FaExternalLinkAlt} boxSize={3} />}
                    fontWeight="500"
                    borderRadius="full"
                    onClick={() => window.open("https://docs.poa.community", "_blank")}
                  >
                    Docs
                  </Button>
                </>
              )}
            </HStack>
          </motion.div>

          {/* Badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            <HStack spacing={2} wrap="wrap" justify="center">
              {[
                { icon: FaLink, label: "Decentralized" },
                { icon: FaUsers, label: "Community-Owned" },
                { icon: FaSearch, label: "Transparent" },
              ].map((badge) => (
                <Flex
                  key={badge.label}
                  align="center"
                  bg="whiteAlpha.100"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  borderRadius="full"
                  px={3}
                  py={1}
                >
                  <Icon
                    as={badge.icon}
                    color="whiteAlpha.600"
                    boxSize={2.5}
                    mr={1.5}
                  />
                  <Text
                    fontSize="xs"
                    fontWeight="500"
                    color="whiteAlpha.700"
                  >
                    {badge.label}
                  </Text>
                </Flex>
              ))}
            </HStack>
          </motion.div>

          {/* Footer */}
          <Text
            fontSize="xs"
            color="whiteAlpha.300"
            fontWeight="400"
            textAlign="center"
            mt={4}
            letterSpacing="0.03em"
          >
            Powered by Poa
          </Text>
        </VStack>
      </Box>
    </>
  );
};

export default Home;
