import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants } from 'ethers';
import { createRoleOperationHost } from '@/lib/accessV2/roleOperationHost';
import { buildRoleFormBatch, defaultRoleForm, roleFormCopy } from '@/lib/accessV2/roleFormBatch';
import { roleFormRequest } from '@/lib/accessV2/roleFormRequest';
import { operationFixture, account, roleId, groupId } from '@/lib/accessV2/roleObservationFixtures';

// Independent review regressions R5/R6. Use the actual installed operation and
// raw ABI fixture: display and semantic review need the same complete values
// that the previous frontend observer retained, including uint256 precision.
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('installed role operation review contract', () => {
  it('retains the complete voting-class meaning across the package boundary', async () => {
    const fixture = await operationFixture();
    const result = await createRoleOperationHost(fixture.input.readFactory).read({ ...fixture.input, purpose: 'capabilities' });
    expect(result.status, JSON.stringify(result.codes)).toBe('ready');
    expect(result.data.context.data.hybrid.classes).toEqual([
      { classIndex: 0, strategy: 0, slicePct: 80, quadratic: false, minBalance: '0', asset: constants.AddressZero, hatIds: [roleId] },
      { classIndex: 1, strategy: 1, slicePct: 20, quadratic: true, minBalance: '123456789012345678901', asset: account, hatIds: [groupId] },
    ]);
  });

  it('places the reviewed seat limit and description in the creation summary', async () => {
    const form = { ...defaultRoleForm(), name: 'Builders', description: 'Coordinate shared work.',
      limitSeats: true, maxMembers: 5, sponsorship: { enabled: false } };
    const fixture = await operationFixture();
    const operation = await createRoleOperationHost(fixture.input.readFactory).review({ ...fixture.input, request: roleFormRequest(form) });
    expect(operation.status, JSON.stringify(operation.codes)).toBe('ready');
    const built = buildRoleFormBatch({ form, operation });
    expect(built.summaries.join(' ')).toMatch(/5.*(?:seat|member)|(?:seat|member).*5/i);
    expect(built.summaries.join(' ')).toMatch(/description/i);
    expect(roleFormCopy(form).description).not.toMatch(/separate second vote:\s*5 seats/i);
  });
});
