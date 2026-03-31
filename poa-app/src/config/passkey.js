/**
 * Passkey & ERC-4337 Configuration
 */

import { DEFAULT_CHAIN_ID } from './networks';

// ERC-4337 EntryPoint v0.7 (same on all chains)
export const ENTRY_POINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

// Pimlico bundler endpoint — configured per chain via env var
export const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || '';

export function getBundlerUrl(chainId = DEFAULT_CHAIN_ID) {
  if (!PIMLICO_API_KEY) {
    console.warn('NEXT_PUBLIC_PIMLICO_API_KEY not set — bundler calls will fail');
  }
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${PIMLICO_API_KEY}`;
}

// WebAuthn Relying Party configuration
export const WEBAUTHN_RP_NAME = 'Perpetual Organization Architect';

// Gas estimation buffer percentage (applied on top of bundler estimates)
export const GAS_BUFFER_PERCENT = 10n;

// Maximum total gas per UserOp — Pimlico bundler rejects ops above 15M.
// Leave headroom for bundler-side overhead calculations.
export const MAX_USEROP_GAS = 14_500_000n;
