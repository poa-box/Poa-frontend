import { describe, expect, it, vi } from 'vitest';
import { RoleCreationService } from '@/services/web3/domain/RoleCreationService';

// Protocol metadata/sponsor ABI assertions are retained at roleObservation.abi.test.js.
// This test owns only the service handoff; it explicitly stubs the shared API boundary.
describe('RoleCreationService shared operation handoff', () => {
  it.each([['getRolePlanningEvidence', 'read'], ['reviewRoleOperation', 'review'],
    ['prepareRoleOperation', 'prepare'], ['revalidatePreparedRoleOperation', 'revalidate']])('%s forwards the exact opaque request to %s', async (method, operation) => {
    const service = new RoleCreationService({});
    const result = Object.freeze({ status: 'unknown', codes: ['NOT_VERIFIED'] }), input = Object.freeze({ marker: 'request' });
    const read = vi.fn(async () => result); service.roleOperations = async () => ({ [operation]: read });
    expect(await service[method](input)).toBe(result); expect(read).toHaveBeenCalledWith(input);
  });
  it('retains election acceptance reads and exact IDs outside the migrated role operation', async () => {
    const getStatus = vi.fn(async () => ({ accepted: false }));
    const service = new RoleCreationService({ createReadOnly: () => ({ getStatus }) });
    const address = `0x${'1'.repeat(40)}`, authority = `0x${'2'.repeat(40)}`;
    expect(await service.getElectionAcceptance(authority, [{ subjectId: '123456789012345678901', addresses: [address, address.toUpperCase()] }]))
      .toEqual({ '123456789012345678901': { [address]: false } });
    expect(getStatus).toHaveBeenCalledOnce();
  });
});
