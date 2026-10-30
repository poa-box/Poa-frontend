import { describe, expect, it } from 'vitest';
import { ethers } from 'ethers';
import TaskManagerABI from '../../../abi/TaskManagerNew.json';
import { taskCreatedIdsFromResult } from '@/lib/tasks/receipts';

const TM = `0x${'12'.repeat(20)}`;
const OTHER = `0x${'34'.repeat(20)}`;
const PID = `0x${'00'.repeat(31)}07`;
const HASH = `0x${'ab'.repeat(32)}`;
const iface = new ethers.utils.Interface(TaskManagerABI);
const zero = ethers.constants.AddressZero;
function creation(title) {
  return { projectId: PID, payoutRaw: '9007199254740993', title, metadataHash: HASH,
    bountyToken: zero, bountyPayoutRaw: '0', requiresApplication: false };
}
function log(id, evidence, address = TM) {
  const event = iface.encodeEventLog(iface.getEvent('TaskCreated'), [id, evidence.projectId,
    evidence.payoutRaw, evidence.bountyToken, evidence.bountyPayoutRaw, evidence.requiresApplication,
    ethers.utils.toUtf8Bytes(evidence.title), evidence.metadataHash]);
  return { address, topics: event.topics, data: event.data };
}
function result(logs, status = 1) { return { success: true, receipt: { status, logs } }; }

describe('receipt IDs replace indexed-max predictions', () => {
  it('matches exact emitter and draft payload and returns IDs in draft order', () => {
    const a = creation('First');
    const b = creation('Second');
    const receipt = result([log('90', a, OTHER), log('9007199254740994', b), log('9007199254740993', a)]);
    expect(taskCreatedIdsFromResult(receipt, TM, [a, b])).toMatchObject({ state: 'known',
      value: ['9007199254740993', '9007199254740994'] });
    expect(receipt.receipt.logs).toHaveLength(3);
  });
  it.each([0, false, undefined])('does not attest failed/unknown outer status %s', status => {
    const a = creation('First');
    const receipt = { success: true, receipt: { status, logs: [log('7', a)] } };
    expect(taskCreatedIdsFromResult(receipt, TM, [a]).state).toBe('unknown');
  });
  it('requires the manager attestation of success and accepts viem receipt success', () => {
    const a = creation('First');
    expect(taskCreatedIdsFromResult({ success: false, receipt: result([log('7', a)]).receipt }, TM, [a]).state).toBe('unknown');
    expect(taskCreatedIdsFromResult(result([log('7', a)], 'success'), TM, [a])).toMatchObject({ state: 'known', value: ['7'] });
  });
  it('refuses absent, ambiguous, wrong-payout and wrong-emitter matches', () => {
    const a = creation('First');
    for (const logs of [[], [log('7', a), log('8', a)], [log('7', { ...a, payoutRaw: '1' })], [log('7', a, OTHER)]]) {
      expect(taskCreatedIdsFromResult(result(logs), TM, [a]).state).toBe('unknown');
    }
  });
  it('records the core gap for two identical draft payloads instead of inventing IDs', () => {
    const same = creation('Repeated draft');
    expect(taskCreatedIdsFromResult(result([log('7', same), log('8', same)]), TM, [same, same])).toMatchObject({
      state: 'unknown', code: 'AMBIGUOUS_TASK_CREATED',
    });
  });
});

describe('identical drafts need an actual single-operation creation scope', () => {
  it('uses exact IDs in emission order for a direct TaskService call, without changing the outer receipt', () => {
    const same = creation('Repeated draft');
    const receipt = result([log('9007199254740994', same), log('9007199254740993', same)]);
    expect(taskCreatedIdsFromResult(receipt, TM, [same, same], { directCreationCall: true })).toMatchObject({
      state: 'known', value: ['9007199254740994', '9007199254740993'],
    });
    expect(receipt.receipt.logs).toHaveLength(2);
  });
  it('never borrows the identical creations of a second UserOp in the same bundle', () => {
    const same = creation('Repeated draft');
    const ownedLogs = [log('7', same), log('8', same)];
    const receipt = result([log('6', same), ...ownedLogs, log('9', same)]);
    expect(taskCreatedIdsFromResult(receipt, TM, [same, same], { requiresOperationScope: true, directCreationCall: true }).state).toBe('unknown');
    const operation = { success: true, taskManagerAddress: TM, logs: ownedLogs, creationLogScope: 'ordered-single-operation' };
    expect(taskCreatedIdsFromResult({ ...receipt, creationOperation: operation }, TM, [same, same], { requiresOperationScope: true }))
      .toMatchObject({ state: 'known', value: ['7', '8'] });
    expect(taskCreatedIdsFromResult({ ...receipt, creationOperation: { ...operation, creationLogScope: undefined } }, TM,
      [same, same], { requiresOperationScope: true }).state).toBe('unknown');
    expect(taskCreatedIdsFromResult({ ...receipt, creationOperation: { ...operation, logs: [log('77', same), log('88', same)] } }, TM,
      [same, same], { requiresOperationScope: true }).state).toBe('unknown');
  });
});
