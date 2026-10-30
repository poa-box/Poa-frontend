// Paint only: geometry belongs to ModalContent's responsive props. Glass helper
// layout (height, inherited radius and stacking) must never override the dialog.
export const createVoteSurfaceStyle = {
  backgroundColor: 'var(--chakra-colors-purple-900)',
  border: '1px solid rgba(190, 162, 225, 0.24)',
};

export const createVoteModalStyles = {
  '--chakra-colors-purple-900': '#30223f',
  '--chakra-colors-gray-400': '#c2b7ce',
  '--chakra-colors-gray-500': '#b4a6c3',
  '& .chakra-modal__body': { overscrollBehavior: 'contain' },
  '& .chakra-text': { overflowWrap: 'anywhere' },
  '& .chakra-input, & .chakra-textarea, & .chakra-select': {
    bg: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(210, 191, 231, 0.35)',
    _placeholder: { color: 'gray.400', opacity: 1 },
    _hover: { borderColor: 'purple.300' },
    _focusVisible: {
      borderColor: 'purple.300',
      boxShadow: '0 0 0 1px var(--chakra-colors-purple-300)',
    },
    '& option': { bg: 'purple.900', color: 'white' },
  },
  '& .chakra-button': {
    _focusVisible: { outline: '2px solid', outlineColor: 'purple.200', outlineOffset: '3px' },
    _disabled: { opacity: 0.55, cursor: 'not-allowed' },
  },
  '& .chakra-checkbox': { minH: '44px', alignItems: 'center', gap: 2 },
  '& .chakra-checkbox__label': { color: 'gray.100', marginInlineStart: 0 },
  '& .chakra-checkbox__control': {
    borderColor: 'whiteAlpha.500',
    bg: 'transparent',
    '&[data-checked], &[data-indeterminate]': { bg: 'amethyst.500', borderColor: 'amethyst.300', color: 'white' },
    '&[data-focus-visible]': { outline: '2px solid', outlineColor: 'amethyst.200', outlineOffset: '3px' },
    '&[data-disabled]': { opacity: 0.45 },
  },
  '& [data-testid="role-form"] button[aria-pressed]': {
    color: 'gray.100', borderColor: 'whiteAlpha.400', minH: '44px',
    '&[aria-pressed="true"]': { color: 'white', bg: 'amethyst.700', borderColor: 'amethyst.300' },
    _hover: { bg: 'whiteAlpha.200' },
  },
  '& [data-testid="vote-restrictions"] .chakra-wrap__list': {
    display: 'grid', gridTemplateColumns: { base: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  },
  '& [data-testid="role-form"] [aria-label="Creation steps"] .chakra-wrap__list': {
    display: 'grid', gridTemplateColumns: { base: 'repeat(3, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' },
  },
  // RoleForm is shared with organization pages; these overrides belong only
  // to this modal. aria-pressed exposes the chosen review path to readers too.
  '& [data-testid="role-form-staged"], & [data-testid="role-form-compound"], & [data-testid="role-form-review-retry"]': {
    color: 'gray.100',
    bg: 'whiteAlpha.50',
    border: '1px solid',
    borderColor: 'whiteAlpha.400',
    whiteSpace: 'normal',
    height: 'auto',
    minH: 8,
    py: 2,
    _hover: { bg: 'whiteAlpha.200' },
    '&[aria-pressed="true"]': {
      bg: 'amethyst.700',
      borderColor: 'amethyst.300',
      _hover: { bg: 'amethyst.600' },
    },
    _disabled: { opacity: 0.55, cursor: 'not-allowed', _hover: { bg: 'whiteAlpha.50' } },
  },
  '& [data-testid="role-form"] [aria-label="Creation steps"] .chakra-button': {
    bg: 'transparent',
    color: 'gray.200',
    minH: '44px',
    height: 'auto',
    whiteSpace: 'normal',
    _hover: { bg: 'whiteAlpha.100' },
    '&[aria-current="step"]': {
      bg: 'amethyst.700',
      color: 'white',
      _hover: { bg: 'amethyst.600' },
    },
    _disabled: { opacity: 0.55, color: 'gray.400', cursor: 'default', bg: 'transparent' },
  },
  '& [data-testid="role-form"] .chakra-alert': {
    bg: 'amethyst.900',
    color: 'gray.100',
    '& .chakra-alert__icon': { color: 'amethyst.200' },
    '&[data-status="error"]': {
      bg: 'rose.900',
      color: 'rose.100',
      '& .chakra-alert__icon': { color: 'rose.200' },
    },
    '&[data-status="warning"]': {
      bg: 'rgba(237, 137, 54, 0.12)',
      color: 'orange.100',
      '& .chakra-alert__icon': { color: 'orange.200' },
    },
  },

};
