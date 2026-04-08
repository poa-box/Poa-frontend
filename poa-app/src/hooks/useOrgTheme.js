import { usePOContext } from '@/context/POContext';

/**
 * Hook for accessing org theme settings from metadata.
 *
 * Returns the raw theme values from the org's metadata and a helper
 * to resolve a page background with a per-page fallback.
 *
 * Adding a new theme field (e.g. accentColor, textColor) requires:
 *   1. Add the field to the subgraph OrgMetadata schema
 *   2. Parse it in org-metadata.ts
 *   3. Add it to the GraphQL query + POContext
 *   4. Expose it from this hook
 * No page files need to change unless they consume the new field.
 */
export function useOrgTheme() {
  const { backgroundColor } = usePOContext();

  return {
    backgroundColor,
    /**
     * Returns the org's background color or the provided fallback.
     * Use as: <Box background={pageBackground("gray.900")}>
     */
    pageBackground: (fallback) => backgroundColor || fallback,
  };
}
