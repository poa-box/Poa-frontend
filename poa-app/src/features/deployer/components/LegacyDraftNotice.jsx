import { Alert, AlertIcon, Box, Button, Text } from '@chakra-ui/react';
import { legacyDraftIssues, LEGACY_DRAFT_MESSAGE } from '@/lib/deployment/nativeDraft';
export default function LegacyDraftNotice({ state, onReset }) {
  const issues = legacyDraftIssues(state);
  if (!issues.length) return null;
  return <Alert status="warning" borderRadius="lg" alignItems="start">
    <AlertIcon /><Box><Text>{LEGACY_DRAFT_MESSAGE}</Text>
      <Text fontSize="sm" mt={2}>{issues.join('; ')}</Text>
      <Button size="sm" mt={3} onClick={onReset}>Reset draft</Button>
    </Box>
  </Alert>;
}
