import { createContext, useContext, useEffect } from 'react';
import { Box, Button, Text } from '@chakra-ui/react';

export const TaskDialogContext = createContext(null);

// Keep the modal/focus-management libraries with the actual forms. This small
// first-open status can still be dismissed or retried while that code loads.
export function TaskDialogLoading({ error, retry, pastDelay }) {
  const dialog = useContext(TaskDialogContext);
  const isOpen = dialog?.isOpen;
  const onClose = dialog?.onClose;
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);
  // Next delays pending UI by 200 ms; cached or quick imports need no flash.
  // Errors remain visible immediately, and Escape works throughout the wait.
  if (!isOpen || (!error && !pastDelay)) return null;
  return (
    <Box position="fixed" bottom={4} right={4} maxW="calc(100vw - 32px)"
      bg="white" color="warmGray.800" borderRadius="lg" boxShadow="lg" p={4} zIndex="toast">
      <Text role={error ? 'alert' : 'status'} mb={3}>
        {error ? `${dialog.title} couldn’t load.` : `Opening ${dialog.title.toLowerCase()}…`}
      </Text>
      {error && <Button size="sm" mr={2} onClick={retry}>Try again</Button>}
      <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
    </Box>
  );
}
