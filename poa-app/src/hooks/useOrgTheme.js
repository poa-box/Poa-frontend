import { useMemo } from 'react';
import { usePOContext } from '@/context/POContext';
import { getBackgroundMode, resolveOnBackground } from '@/util/colorContrast';

/**
 * Hook for accessing org theme settings from metadata.
 *
 * Returns the raw background color, a helper to resolve a page background
 * with a per-page fallback, and adaptive foreground tokens that stay legible
 * regardless of what color the org picked (light, dark, gradient, etc.).
 *
 * Use:
 *   const { pageBackground, onBackground, onBackgroundMuted } = useOrgTheme();
 *   <Box background={pageBackground()}>
 *     <Heading color={onBackground}>Title</Heading>
 *     <Text color={onBackgroundMuted}>Subtitle</Text>
 *   </Box>
 *
 * Adding a new theme field (e.g. accentColor) requires:
 *   1. Add the field to the subgraph OrgMetadata schema
 *   2. Parse it in org-metadata.ts
 *   3. Add it to the GraphQL query + POContext
 *   4. Expose it from this hook
 */
export function useOrgTheme() {
  const { backgroundColor } = usePOContext();

  const { backgroundMode, onBackground, onBackgroundMuted, onBackgroundSubtle } = useMemo(() => {
    const mode = getBackgroundMode(backgroundColor);
    return { backgroundMode: mode, ...resolveOnBackground(mode) };
  }, [backgroundColor]);

  return {
    backgroundColor,
    backgroundMode,
    onBackground,
    onBackgroundMuted,
    onBackgroundSubtle,
    /**
     * Returns the org's background color or the provided fallback.
     * Use as: <Box background={pageBackground("gray.900")}>
     */
    pageBackground: (fallback) => backgroundColor || fallback,
  };
}
