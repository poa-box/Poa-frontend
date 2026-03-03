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
