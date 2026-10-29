/**
 * Token configuration for bounty payments.
 * Addresses are sourced from network config (per-chain).
 * Only tokens with real deployed addresses on the current chain are available.
 */

import { NETWORKS } from '@/config/networks';
import { PARTICIPATION_TOKEN_DECIMALS, getTokenByAddress as coreTokenByAddress } from '@poa-box/core/chains';
import { requireRawUint } from '@poa-box/core/amounts';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';

// Token metadata (chain-independent).
// isStable marks USD-pegged tokens (~$1). Only these are summed into the treasury's
// headline USD figure; tokens without a dollar peg are shown in native units.
// BREAD is Breadchain's stablecoin, minted and redeemable 1:1 against xDAI.
const TOKEN_META = {
  USDC:  { symbol: 'USDC',  name: 'USD Coin', logo: '/images/tokens/usdc.png', projectUrl: 'https://www.circle.com/usdc', isStable: true },
  DAI:   { symbol: 'DAI',   name: 'Dai Stablecoin', logo: '/images/tokens/dai.png', projectUrl: 'https://makerdao.com/dai', isStable: true },
  BREAD: { symbol: 'BREAD', name: 'Breadchain', logo: '/images/tokens/bread.png', projectUrl: 'https://fund.bread.coop/', isStable: true },
  WXDAI: { symbol: 'WXDAI', name: 'Wrapped xDAI', logo: null, projectUrl: null, isStable: true },
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Sentinel for "no bounty token" (PT-only payout)
export const NO_BOUNTY_TOKEN = {
  address: ZERO_ADDRESS,
  symbol: DEFAULT_TOKEN_LABEL,
  name: DEFAULT_TOKEN_LABEL,
  decimals: PARTICIPATION_TOKEN_DECIMALS,
  isDefault: true,
  logo: null,
  projectUrl: null,
  isStable: false,
};

// Build flat address→token lookup across all chains (addresses are globally unique)
const ADDRESS_LOOKUP = {};
for (const network of Object.values(NETWORKS)) {
  if (!network.bountyTokens) continue;
  for (const [symbol, addr] of Object.entries(network.bountyTokens)) {
    const meta = TOKEN_META[symbol];
    if (meta && addr) {
      ADDRESS_LOOKUP[addr.toLowerCase()] = { ...coreTokenByAddress(addr), address: addr, ...meta, isDefault: false };
    }
  }
}

/**
 * Get the list of available bounty tokens for a given chain.
 * Returns only tokens with real deployed addresses on that chain.
 */
export function getBountyTokenOptions(chainId) {
  const network = Object.values(NETWORKS).find(n => n.chainId === chainId);
  if (!network?.bountyTokens) return [];
  return Object.entries(network.bountyTokens)
    .filter(([symbol, addr]) => addr && TOKEN_META[symbol])
    .map(([symbol, addr]) => ({ ...coreTokenByAddress(addr), address: addr, ...TOKEN_META[symbol], isDefault: false }));
}

/**
 * Look up token info by on-chain address. Works across all configured chains.
 */
export function getTokenByAddress(address) {
  if (!address || address === ZERO_ADDRESS) return NO_BOUNTY_TOKEN;
  return ADDRESS_LOOKUP[address.toLowerCase()] || {
    address,
    symbol: 'ERC20',
    name: 'Unknown Token',
    decimals: 18,
    isDefault: false,
    logo: null,
    projectUrl: null,
    isStable: false,
  };
}

/**
 * Check if a task has a bounty configured (non-zero token and amount).
 */
export function hasBounty(bountyToken, bountyAmount) {
  if (!bountyToken || bountyToken === ZERO_ADDRESS || bountyAmount == null || bountyAmount === '') return false;
  try {
    return BigInt(requireRawUint(bountyAmount)) > 0n;
  } catch {
    return false;
  }
}

/** Preserve fixed-decimal, rounded bounty presentation without Number narrowing. */
export function formatBountyAmount(weiAmount, tokenAddress) {
  if (!weiAmount || weiAmount === '0') return '0';
  const token = getTokenByAddress(tokenAddress);
  const places = token.decimals <= 6 ? 2 : 4;
  const raw = BigInt(requireRawUint(weiAmount));
  const divisor = 10n ** BigInt(token.decimals);
  const units = 10n ** BigInt(places);
  const rounded = (raw * units + divisor / 2n) / divisor;
  const formatted = `${rounded / units}.${(rounded % units).toString().padStart(places, '0')}`;
  return `${formatted} ${token.symbol}`;
}

// --- Legacy exports (used by AddTaskModal, EditTaskModal) ---
// BOUNTY_TOKENS.NONE is still needed as the "no bounty" sentinel.
// BOUNTY_TOKEN_OPTIONS is replaced by getBountyTokenOptions(chainId) in components.
export const BOUNTY_TOKENS = { NONE: NO_BOUNTY_TOKEN };
export const BOUNTY_TOKEN_OPTIONS = Object.values(ADDRESS_LOOKUP);
