/**
 * E2E mode flag — single source of truth.
 *
 * The `env` field in next.config.mjs force-inlines these vars at build time
 * (Next.js's automatic NEXT_PUBLIC_* inlining only fires when an env var has
 * a defined value, leaving runtime lookups otherwise). Production consumers
 * must guard E2E branches with `process.env.NEXT_PUBLIC_E2E_MODE === 'true'`
 * directly so DefinePlugin can remove them before chunk splitting. Importing
 * E2E_ENABLED can leave a cross-chunk property read: false at runtime, but
 * still retaining the disabled code and its dependencies in production.
 */
export const E2E_ENABLED = process.env.NEXT_PUBLIC_E2E_MODE === 'true';

export const E2E_BURNER_PK = process.env.NEXT_PUBLIC_E2E_BURNER_PK || '';
export const E2E_PASSKEY_SEED = process.env.NEXT_PUBLIC_E2E_PASSKEY_SEED || '';
export const E2E_ORG_NAME = process.env.NEXT_PUBLIC_E2E_ORG_NAME || 'Test6';
// 'eoa' (default) auto-connects the burner; 'passkey' skips so the
// vouch-first onboarding path activates. Set per dev session via the
// dev:e2e-passkey package script.
export const E2E_AS = process.env.NEXT_PUBLIC_E2E_AS === 'passkey' ? 'passkey' : 'eoa';
