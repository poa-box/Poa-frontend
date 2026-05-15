# Editable Project Budgets UI

## Feature: TaskPerm.BUDGET

Users with `TaskPerm.BUDGET` (bit 5) can resize project PT caps and per-token bounty caps post-creation.

## UI Components

### BudgetEditor
- Displays current PT cap and per-token bounty caps
- Inline editing with save/cancel
- Validation: cap cannot be reduced below current allocation
- Confirmation modal for increases > 50%

### BudgetHistory
- Timeline of budget changes
- Shows who changed what and when
- Links to relevant on-chain transactions

### PermissionGate
- Checks if connected wallet has TaskPerm.BUDGET
- Shows "Request Permission" button if not
- Disables editing for non-permissioned users

## State Management
```
budget: {
  ptCap: number;
  tokenBountyCaps: Map<string, number>;
  lastModified: timestamp;
  modifiedBy: address;
}
```

## Events
- `BudgetUpdated(projectId, newCap, modifiedBy)`
- `BountyCapUpdated(projectId, tokenId, newCap)`

## API Endpoints
- `GET /api/projects/:id/budget` - Get current budget
- `PUT /api/projects/:id/budget` - Update budget (requires TaskPerm.BUDGET)
