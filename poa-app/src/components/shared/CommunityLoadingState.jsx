import { useEffect, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import PulseLoader from "@/components/shared/PulseLoader";
import { loadingQuotes } from "@/components/shared/loadingQuotes";

export default function CommunityLoadingState({
  label = "Loading your community…",
  description,
  fullScreen = false,
  children,
}) {
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [reflection, setReflection] = useState(null);
  const visible = fullScreen || delayElapsed;

  useEffect(() => {
    // Select only after hydration, once for this mounted wait.
    setReflection(loadingQuotes[Math.floor(Math.random() * loadingQuotes.length)]);
  }, []);

  useEffect(() => {
    if (fullScreen) return;
    // Fast reads resolve without flashing a status; readiness is never delayed.
    const timer = setTimeout(() => setDelayElapsed(true), 200);
    return () => clearTimeout(timer);
  }, [fullScreen]);

  return (
    <Box
      minH={fullScreen ? "100svh" : undefined}
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={4}
      py={fullScreen ? 8 : 6}
      color="inherit"
    >
      <Box visibility={visible ? "visible" : "hidden"} aria-hidden={!visible} maxW="32rem" textAlign="center">
        <Box role="status" aria-atomic="true">
          <Box display="flex" alignItems="center" justifyContent="center" gap={3}>
            <PulseLoader size="lg" color="currentColor" label={null} />
            <Text fontSize="md" fontWeight="500" overflowWrap="anywhere">{label}</Text>
          </Box>
          {description && <Text mt={2} fontSize="sm" lineHeight="tall">{description}</Text>}
        </Box>
        {reflection && (
          <Text mt={5} mx="auto" maxW="28rem" fontSize="md" lineHeight="tall" opacity={0.8}>
            {reflection}
          </Text>
        )}
        {children && <Box mt={4}>{children}</Box>}
      </Box>
    </Box>
  );
}
