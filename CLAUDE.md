# POA Frontend (hamburg-v3)

## Commands

All commands run from `poa-app/`:

```bash
cd poa-app && yarn dev      # dev server
cd poa-app && yarn build    # production build (static export to IPFS)
cd poa-app && yarn lint     # ESLint (Next.js built-in)
```

No tests. No Prettier. No formatting commands.

## Stack

Next.js 14, React 18, **JavaScript** (not TypeScript). Chakra UI 2. Wagmi 2 + ethers 5 + viem 2.
Static export (`output: 'export'`). Yarn. Node 18.18.0 (Volta).

## Path Aliases

`@/*` maps to `poa-app/src/*` (jsconfig.json). Always use `@/` imports, never relative `../../`.
ABIs live at `poa-app/abi/` (outside src) — import with `../../abi/FooBar.json`.

## Gotchas

### Three util directories — don't confuse them

- `src/util/` — queries, apolloClient, formatToken, permissions, tokens, crossChainUsername, etc.
- `src/utils/` — profileUtils.js only
- `src/services/web3/utils/` — encoding.js (IPFS CID conversion, parseTaskId, parseProjectId)

`encoding.js` is in `services/web3/utils/`, NOT in `src/util/`.

### Dual auth system

AuthContext unifies EOA (RainbowKit/wagmi) and Passkey (ERC-4337 smart accounts).
- EOA uses `TransactionManager` (direct ethers tx)
- Passkey uses `SmartAccountTransactionManager` (UserOp via Pimlico bundler)
- `useWeb3Services()` returns the correct manager based on auth type automatically
- **Never** call ethers/viem directly from components — always go through services

### Token amounts are always 18-decimal wei from subgraph

Use `formatTokenAmount()` / `parseTokenAmount()` from `src/util/formatToken.js`.
Getting this wrong produces numbers that are 10^18 too large or too small.

### Subgraph queries need chain routing

Apollo queries must pass `context: { subgraphUrl }` (from POContext). Without it,
queries hit the default subgraph and return wrong-chain data.

For cross-chain queries, use `fetchPolicy: 'no-cache'` — Apollo caches by
query+variables, NOT by endpoint, so different chains poison each other's cache.

### Subgraph IDs have composite format

Entity IDs from The Graph: `"{contractAddress}-{numericId}"`. Contracts expect
just the numeric part. Use `parseTaskId()`, `parseProjectId()`, `parseModuleId()`
from `services/web3/utils/encoding.js`. Wrong format = silent contract reverts.

### Org-scoped state via query param

All org pages read `router.query.userDAO`. POContext uses this to resolve `orgId`,
`subgraphUrl`, `orgChainId`. If `userDAO` is missing, POContext provides nulls —
this is expected on non-org pages.

### Optimistic updates have grace period locks

UserContext (15s) and TaskBoardContext (65s) use `optimisticLockRef` to prevent stale
subgraph data from overwriting optimistic state. The subgraph has indexing delay —
do not reduce these timeouts.

### IPFS CID ↔ bytes32 encoding

Contracts store IPFS content as bytes32. Use `ipfsCidToBytes32(cid)` and
`bytes32ToIpfsCid(hash)` from `services/web3/utils/encoding.js`.
CIDs must be CIDv0 (start with "Qm"). CIDv1 will not work.

### Pages are thin wrappers

Page files in `src/pages/` should only import components and set up routing. All
business logic and UI lives in `src/components/` or `src/features/`. Do not add
logic to page files.

## Conventions

### Service layer is mandatory for all contract calls

```
services/web3/core/    → ContractFactory, TransactionManager, SmartAccountTransactionManager
services/web3/domain/  → UserService, VotingService, TaskService, EducationService, etc.
```

Components use hooks (`useWeb3Services`, `useWeb3`) to get services. Use
`useTransactionWithNotification().executeWithNotification()` for the pending → success/error
notification flow.

### RefreshContext for cross-context data updates

After a transaction, emit a `RefreshEvent` (e.g., `TASK_CREATED`, `PROPOSAL_VOTED`).
Other contexts subscribe via `useRefreshSubscription`. Do NOT import contexts into
each other to trigger refetches — that creates circular dependencies.

### Error handling

`ErrorParser.js` in `src/lib/errors/` maps 26+ custom contract error selectors and
revert strings to user-friendly messages. Let the service layer's error parsing handle
contract errors — do not catch and reformat them in components.

### Multi-chain architecture

- **Arbitrum** (42161) = home chain (accounts, usernames, infrastructure)
- **Gnosis** (100) = default org deployment chain
- **Sepolia** / **Base Sepolia** = testnets

Config in `src/config/networks.js`. Never hardcode chain IDs.

### Chakra UI theme

Custom palettes: `coral`, `rose`, `amethyst`, `warmGray` — not standard Chakra colors.
Custom variants: `glass`, `elevated`, `primary`. Theme is defined inline in `_app.js`.

### Provider nesting order matters

16 providers nested in `_app.js`. Inner contexts depend on outer ones — check `_app.js`
before adding or reordering providers.

### Task permissions

Hat-based permission system matching `TaskPerm.sol`. Check permissions with
`userHasProjectPermission(userHatIds, projectRolePermissions, permType)` or the
convenience wrappers (`userCanCreateTask`, `userCanClaimTask`, `userCanReviewTask`,
`userCanAssignTask`) from `src/util/permissions.js`.

### Glass morphism styling

Use `glassLayerStyle` / `glassLayerLightStyle` from `@/components/shared/glassStyles`.
These are used in 40+ files. Do NOT use `backdrop-filter: blur()` — it was removed
for Safari CPU performance. The constants use opacity-based fallbacks instead.

## Environment Variables

All prefixed `NEXT_PUBLIC_*`. `NEXT_PUBLIC_PIMLICO_API_KEY` is required for passkey auth.
RPCs and subgraph URLs have hardcoded fallbacks in `config/networks.js`.
No `.env` file is committed — defaults work for read-only browsing.
