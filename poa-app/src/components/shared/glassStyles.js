/**
 * Shared glass morphism styles used across the application
 *
 * Note: backdrop-filter: blur() was removed for Safari performance.
 * Safari renders blur using CPU, causing severe rendering lag with
 * 40+ blur elements across the app. At 82% opacity the visual
 * difference is negligible.
 */

export const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, .82)',
};

/**
 * Lighter glass variant for nested elements
 */
export const glassLayerLightStyle = {
  ...glassLayerStyle,
  backgroundColor: 'rgba(0, 0, 0, .6)',
};

/**
 * Shared dark-themed input styles for Chakra UI form elements.
 * Used across modals and forms for consistent look-and-feel.
 */
export const inputStyles = {
  bg: 'whiteAlpha.100',
  border: '1px solid',
  borderColor: 'whiteAlpha.300',
  color: 'white',
  _placeholder: { color: 'gray.400' },
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: {
    borderColor: 'purple.400',
    boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)',
  },
};
