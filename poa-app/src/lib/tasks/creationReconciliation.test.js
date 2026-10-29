import { describe, expect, it } from 'vitest';
import { ethers } from 'ethers';
import { taskCreatedIdsFromResult } from '@/lib/tasks/receipts';
import { pendingTaskId, reconcileCreatedTasks } from '@/lib/tasks/creationReconciliation';
import TaskManagerABI from '../../../abi/TaskManagerNew.json';

const TM = `0x${'12'.repeat(20)}`;
const creation = { projectId: `0x${'01'.repeat(32)}`, payoutRaw: '1000000000000000001', title: 'Exact work',
  metadataHash: `0x${'ab'.repeat(32)}`, bountyToken: ethers.constants.AddressZero, bountyPayoutRaw: '0', requiresApplication: false };
const iface = new ethers.utils.Interface(TaskManagerABI);
function log(id) {
  const encoded = iface.encodeEventLog(iface.getEvent('TaskCreated'), [id, creation.projectId, creation.payoutRaw,
    creation.bountyToken, creation.bountyPayoutRaw, false, ethers.utils.toUtf8Bytes(creation.title), creation.metadataHash]);
  return { address: TM, ...encoded };
}

describe('optimistic creation reconciles only operation-owned exact IDs', () => {
  it('uses local temporary IDs and leaves unknown creations unavailable until indexing', () => {
    const id = pendingTaskId();
    expect(id).not.toBe(pendingTaskId());
    expect(id).not.toMatch(/^0x/);
    const columns = [{ id: 'open', tasks: [{ id, isIndexing: true }, { id: 'other', isIndexing: false }] }];
    expect(reconcileCreatedTasks(columns, [id], { state: 'unknown' }, TM)).toEqual(columns);
    const known = reconcileCreatedTasks(columns, [id], { state: 'known', value: ['9007199254740993'] }, TM);
    expect(known[0].tasks[0]).toMatchObject({ id: `${TM}-9007199254740993`, taskId: '9007199254740993', isIndexing: false });
    expect(known[0].tasks[1]).toBe(columns[0].tasks[1]);
  });
  it('refuses a bundled outer receipt without isolated operation-log evidence', () => {
    const result = { success: true, receipt: { status: 1, logs: [log('9007199254740993')] } };
    expect(taskCreatedIdsFromResult(result, TM, [creation], { requiresOperationScope: true })).toEqual({
      state: 'unknown', code: 'CREATION_OPERATION_SCOPE_UNAVAILABLE' });
    const operation = { success: true, taskManagerAddress: TM, logs: [log('9007199254740993')] };
    expect(taskCreatedIdsFromResult({ ...result, creationOperation: operation }, TM, [creation], { requiresOperationScope: true }))
      .toMatchObject({ state: 'known', value: ['9007199254740993'] });
    expect(result.receipt.logs).toHaveLength(1);
  });
  it('keeps repeated identical drafts unknown with the unscoped matcher', () => {
    const result = { success: true, receipt: { status: 1, logs: [log('7'), log('8')] } };
    expect(taskCreatedIdsFromResult(result, TM, [creation, creation]).state).toBe('unknown');
  });
});

describe('indexed continuation replaces temporary cards with the actual current project', () => {
  it('accepts current-scoped complete indexed rows after the receipt without assigning identical drafts to guessed IDs', async () => {
    const { indexedCreationContinuation } = await import('@/lib/tasks/creationReconciliation');
    const scope = { chainId: 100, orgId: `0x${'ab'.repeat(32)}`, contract: TM, endpoint: 'https://test.invalid',
      projectId: `${TM}-${creation.projectId}`, account: `0x${'34'.repeat(20)}`, hydrated: true };
    const source = { chainId: scope.chainId, orgId: scope.orgId, contract: TM, endpoint: scope.endpoint,
      indexed: true, snapshot: 'pinned', method: 'board', block: { number: '150' } };
    const snapshot = { source, coverage: { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] },
      data: { organization: { id: scope.orgId, taskManager: { id: TM, projects: [{ id: scope.projectId, tasks: [
        { id: `${TM}-9007199254740994`, taskId: '9007199254740994', title: creation.title, status: 'Open', payout: creation.payoutRaw },
        { id: `${TM}-9007199254740993`, taskId: '9007199254740993', title: creation.title, status: 'Open', payout: creation.payoutRaw },
      ] }] } } } };
    const options = { result: { success: true, receipt: { blockNumber: 149n } }, scope,
      refresh: async () => snapshot, assertCurrent: () => {} };
    const confirmed = await indexedCreationContinuation(options);
    expect(confirmed.columns[0].tasks.map(task => task.id)).toEqual([`${TM}-9007199254740994`, `${TM}-9007199254740993`]);
    for (const invalid of [
      { ...snapshot, source: { ...source, endpoint: 'https://other.invalid' } },
      { ...snapshot, source: { ...source, block: { number: '148' } } },
      { ...snapshot, coverage: { ...snapshot.coverage, status: 'incomplete' } },
    ]) expect(await indexedCreationContinuation({ ...options, refresh: async () => invalid })).toBeNull();
    let account = scope.account;
    await expect(indexedCreationContinuation({ ...options, refresh: async () => { account = TM; return snapshot; },
      assertCurrent: () => { if (account !== scope.account) throw new Error('Scope changed'); } })).rejects.toThrow('Scope changed');
  });
});
