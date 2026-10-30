import { beforeEach, expect, it, vi } from 'vitest';
import { roleCreationReference } from '@/services/web3/domain/RoleCreationWorkflow';
import { account, contracts, orgId, hash } from '@/lib/accessV2/roleObservationFixtures';

const readers = { status: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); readers.status.mockResolvedValue({ status: 'ready', data: { creation: { state: 'pending' }, next: 'wait' } }); });
const operation = (digit, nonce) => ({ accountAddress: account, sender: account, nonce,
  computedHash: `0x${digit.repeat(64)}`, userOpHash: `0x${'f'.repeat(64)}`, entryPoint: '0x0000000071727de22e5e9d8baf0edac6f37da032' });
function input() {
  return { scope: { chainId: 100, orgId, contract: contracts.membershipAuthority, account },
    snapshot: { source: { endpoint: 'https://index.invalid', block: { number: '123', hash } }, data: { subjects: [] } },
    creation: { transactionHash: hash, proposalId: '7', call: {}, submission: operation('a', '20') },
    query: vi.fn(), now: () => 1000 };
}
const service = () => ({ getRoleContinuation: args => readers.status({ ...args,
  creation: roleCreationReference(args.creation), ...(args.configuration ? { configuration: roleCreationReference(args.configuration) } : {}) }) });
it('binds the creation proof to the locally computed operation rather than the echoed hash', async () => {
  const args = input(); await service().getRoleContinuation(args);
  expect(readers.status).toHaveBeenCalledOnce();
  expect(readers.status.mock.calls[0][0].creation).toMatchObject({ transactionHash: hash, proposalId: '7',
    operation: { userOpHash: args.creation.submission.computedHash, sender: account, nonce: '20' } });
  expect(readers.status.mock.calls[0][0].creation.executionOperation).toBeUndefined();
});
it('keeps configuration and creation identities independent and never substitutes an execution identity', async () => {
  const args = input(); args.configuration = { transactionHash: `0x${'b'.repeat(64)}`, proposalId: '8', batch: [], submission: operation('c', '21') };
  await service().getRoleContinuation(args);
  expect(readers.status.mock.calls[0][0]).toMatchObject({
    creation: { operation: { userOpHash: args.creation.submission.computedHash, nonce: '20' } },
    configuration: { transactionHash: args.configuration.transactionHash, proposalId: '8',
      operation: { userOpHash: args.configuration.submission.computedHash, nonce: '21' } } });
  expect(readers.status.mock.calls[0][0].configuration.executionOperation).toBeUndefined();
});
it('keeps native EOA transaction nonces out of the UserOperation selector', async () => {
  const args = input(); args.creation.submission = { kind: 'transaction', accountAddress: account, nonce: '22' };
  await service().getRoleContinuation(args);
  expect(readers.status.mock.calls[0][0].creation.operation).toBeUndefined();
});
