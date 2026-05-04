/**
 * E2E mode flag — single source of truth.
 *
 * The `env` field in next.config.mjs force-inlines these vars at build time
 * (Next.js's automatic NEXT_PUBLIC_* inlining only fires when an env var has
 * a defined value, leaving runtime lookups otherwise). With explicit inlining,
 * webpack constant-folds `E2E_ENABLED` to `false` in production, drops every
 * `if (E2E_ENABLED)` branch, and the env var names never appear in the bundle.
 */
export const E2E_ENABLED = process.env.NEXT_PUBLIC_E2E_MODE === 'true';

export const E2E_BURNER_PK = process.env.NEXT_PUBLIC_E2E_BURNER_PK || '';
export const E2E_PASSKEY_SEED = process.env.NEXT_PUBLIC_E2E_PASSKEY_SEED || '';
export const E2E_ORG_NAME = process.env.NEXT_PUBLIC_E2E_ORG_NAME || 'Test6';
// 'eoa' (default) auto-connects the burner; 'passkey' skips so the
// vouch-first onboarding path activates. Set per dev session via the
// dev:e2e-passkey package script.
export const E2E_AS = process.env.NEXT_PUBLIC_E2E_AS === 'passkey' ? 'passkey' : 'eoa';
