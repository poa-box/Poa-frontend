import { describe, expect, it, vi } from 'vitest';
import { RoleCreationService } from '@/services/web3/domain/RoleCreationService';

// Protocol metadata/sponsor ABI assertions are retained at roleObservation.abi.test.js.
// This test owns only the service handoff; it explicitly stubs the shared API boundary.
describe('RoleCreationService shared operation handoff', () => {
  it('retains election acceptance reads and exact IDs outside the migrated role operation', async () => {
    const getStatus = vi.fn(async () => ({ accepted: false }));
    const service = new RoleCreationService({ createReadOnly: () => ({ getStatus }) });
    const address = `0x${'1'.repeat(40)}`, authority = `0x${'2'.repeat(40)}`;
    expect(await service.getElectionAcceptance(authority, [{ subjectId: '123456789012345678901', addresses: [address, address.toUpperCase()] }]))
      .toEqual({ '123456789012345678901': { [address]: false } });
    expect(getStatus).toHaveBeenCalledOnce();
  });
});
