import dynamic from 'next/dynamic';
import { Box, Button, Text } from '@chakra-ui/react';
import { useTour } from '@/features/tour/TourContext';

function PromptLoading({ error, retry }) {
  const { showPromptModal } = useTour();
  if (!showPromptModal || !error) return null;
  return (
    <Box role="alert" position="fixed" bottom={4} right={4} maxW="calc(100vw - 32px)"
      bg="white" color="warmGray.800" borderRadius="lg" boxShadow="lg" p={4} zIndex="toast">
      <Text mb={2}>The tour invitation couldn’t load.</Text>
      <Button size="sm" onClick={retry}>Try again</Button>
    </Box>
  );
}

const TourPrompt = dynamic(() => import('@/features/tour/components/TourPrompt'), {
  loading: PromptLoading,
  ssr: false,
});

/** Keep the closed invitation's modal code outside the public startup bundle. */
export default function DeferredTourPrompt() {
  const { showPromptModal } = useTour();
  return showPromptModal ? <TourPrompt /> : null;
}
