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
 * Light section card — warm glass on gradient background
 * Used for org structure page sections
 */
export const lightSectionStyle = {
  bg: 'rgba(255, 255, 255, 0.8)',
  border: '1px solid',
  borderColor: 'warmGray.200',
  borderRadius: '2xl',
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
};

/**
 * Light inner card — white on glass section
 * Used for nested cards within light sections
 */
export const lightCardStyle = {
  bg: 'white',
  border: '1px solid',
  borderColor: 'warmGray.100',
  borderRadius: 'xl',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
};

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
