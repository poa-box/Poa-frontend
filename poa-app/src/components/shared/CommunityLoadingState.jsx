import { useEffect, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import PulseLoader from "@/components/shared/PulseLoader";

export default function CommunityLoadingState({
  label = "Loading your community…",
  description,
  fullScreen = false,
  children,
}) {
  const [delayElapsed, setDelayElapsed] = useState(false);
  const visible = fullScreen || delayElapsed;

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
            <PulseLoader size="sm" color="currentColor" label={null} />
            <Text fontSize="sm" fontWeight="500" overflowWrap="anywhere">{label}</Text>
          </Box>
          {description && <Text mt={2} fontSize="sm" lineHeight="tall">{description}</Text>}
        </Box>
        {children && <Box mt={4}>{children}</Box>}
      </Box>
    </Box>
  );
}
