// pages/hudson.js
import SEOHead from "@/components/common/SEOHead";
import {
    Box,
    Avatar,
    Heading,
    Text,
    VStack,
    HStack,
    Link,
    IconButton,
  } from "@chakra-ui/react";
  import { FaGithub, FaTwitter, FaTelegram, FaEnvelope } from "react-icons/fa";
  import { RiTwitterXLine } from "react-icons/ri";
  import Navigation from "@/components/Navigation";
  
  const HudsonPage = () => {
    return (
    <>
     <SEOHead
        title="Hudson"
        description="Hudson profile page."
        path="/hudson"
        noIndex
      />
     <Navigation />
      <Box
        display="flex"
        justifyContent="center"
        alignItems="top"
        minH="100vh"
      >
        <Box
          bg="rgba(255, 255, 255, 0.8)"
          borderRadius="2xl"
          boxShadow="lg"
          p={8}
          maxW="600px"
          w="full"
          textAlign="center"
          h="fit-content"
          mt={20}
        >
          {/* Profile Picture */}
          <Avatar
            w="40%"
            h="auto"
            name="Hudson Headley"
            src="/images/hudson.webp" 
            mb={6}
          />
  
          {/* Name and Title */}
          <Heading fontSize="3xl" color="blue.700">
            Hudson Headley
          </Heading>
          <Text fontSize="lg" color="gray.600">
            Founder and Chief Architect at Poa
          </Text>
  
          {/* Bio */}
          <VStack spacing={4} p="6" align="start">
          <Text color="gray.700" fontSize="md" textAlign="justify">
            Hudson is a Protocol Engineer passionate about decentralization, worker ownership, and governance design.
            He has been involved with developing many community-owned organizations with various governance models and is currently developing Poa, a no-code organization builder geared towards organizations that are fully owned by the community and not by capital.
            Hudson hopes to build a space for founders interested in community ownership to experiment and innovate quickly with new governance models.
            <br /><br />
            Hudson is also a non-resident fellow at the IDI, where he contributes to governance research, design, and implementation.
        </Text>

          </VStack>
  
          {/* Social & Contact Links */}
          <HStack spacing={4} justify="center">
            <Link href="https://github.com/hudsonhrh" isExternal>
              <IconButton
                aria-label="GitHub"
                icon={<FaGithub />}
                colorScheme="blue"
                size="lg"
                variant="ghost"
              />
            </Link>
            <Link href="https://twitter.com/hudsonhrh" isExternal>
              <IconButton
                aria-label="Twitter"
                icon={<RiTwitterXLine />}
                colorScheme="blue"
                size="lg"
                variant="ghost"
              />
            </Link>
            <Link href="https://t.me/hudsonhrh" isExternal>
              <IconButton
                aria-label="Telegram"
                icon={<FaTelegram />}
                colorScheme="blue"
                size="lg"
                variant="ghost"
              />
            </Link>
            <Link href="mailto:hudson@poa.box">
              <IconButton
                aria-label="Email"
                icon={<FaEnvelope />}
                colorScheme="blue"
                size="lg"
                variant="ghost"
              />
            </Link>
          </HStack>
        </Box>
      </Box>
    </>
    );
  };
  
  export default HudsonPage;
  