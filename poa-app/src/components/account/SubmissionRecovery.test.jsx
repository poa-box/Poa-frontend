import { fakeBrowserLocks } from '@/services/web3/core/submissionTestHelpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
const state = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], clients: {}, chainClients: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  return { ...actual, useState: value => { const index = state.cursor++; state.slots[index] ||= { value }; return [state.slots[index].value, next => { state.slots[index].value = next; }]; },
    useRef: value => { const index = state.cursor++; return state.slots[index] ||= { current: value }; },
    useEffect: (effect, deps) => { const index = state.cursor++; const previous = state.slots[index]; if (!previous || deps.some((value, i) => value !== previous[i])) { state.slots[index] = deps; state.effects.push(effect); } },
  };
});
vi.mock('@/services/web3/utils/chainClients', () => ({ createChainClients: chain => state.chainClients(chain) }));
import SubmissionRecovery from '@/components/account/SubmissionRecovery';
import { createSubmissionJournal, listPendingSubmissions } from '@/services/web3/core/submissionJournal';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OP = `0x${'aa'.repeat(32)}`;
const TX = `0x${'bb'.repeat(32)}`;
const manager = { getPendingSubmission: () => null };
const guard = () => {};
const view = (assertCurrent = guard) => { state.cursor = 0; const result = SubmissionRecovery({ manager, guard: assertCurrent, accountAddress: ACCOUNT }); for (const effect of state.effects.splice(0)) effect(); return result; };
const textOf = element => element?.props.children[0]?.props.children;
function seed(record) {
  window.localStorage.setItem(`poa:submission:v1:100:${ACCOUNT.toLowerCase()}:${ENTRY_POINT_ADDRESS.toLowerCase()}`,
    JSON.stringify({ ...record, accountAddress: ACCOUNT.toLowerCase(), entryPoint: ENTRY_POINT_ADDRESS }));
}
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: fakeBrowserLocks() });
  vi.clearAllMocks(); state.slots = []; state.effects = [];
  const rows = new Map();
  vi.stubGlobal('window', { localStorage: { get length() { return rows.size; }, key: i => [...rows.keys()][i], getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  state.clients = { publicClient: { getChainId: vi.fn(async () => 100), getTransactionReceipt: vi.fn() }, bundlerClient: { getUserOperationReceipt: vi.fn(async () => ({ receipt: { transactionHash: TX } })), sendUserOperation: vi.fn() } };
  state.chainClients.mockReturnValue(state.clients);
});
afterEach(() => vi.unstubAllGlobals());
describe('account status action uses readonly core reconciliation across target chains', () => {
  it('finds the saved target-chain operation even when the current runtime has no matching manager', async () => {
    seed({ phase: 'submitted', computedHash: OP, entryPoint: ENTRY_POINT_ADDRESS, chainId: 100, sender: ACCOUNT, nonce: '7' });
    const events = new ethers.utils.Interface(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
    state.clients.publicClient.getTransactionReceipt.mockResolvedValue({ status: 1, transactionHash: TX, logs: [{ address: ENTRY_POINT_ADDRESS, ...events.encodeEventLog('UserOperationEvent', [OP, ACCOUNT, ethers.constants.AddressZero, 7, true, 1, 1]) }] });
    view();
    const button = view().props.children[2];
    expect(button.props.children).toBe('Check status');
    await button.props.onClick();
    expect(state.chainClients).toHaveBeenCalledExactlyOnceWith(100);
    expect(textOf(view())).toMatch(/Transaction confirmed/);
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    expect(state.clients.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  });
  it('retains a direct-wallet submission with no returned hash as unknown and never sends', async () => {
    seed({ phase: 'submitting', kind: 'transaction', nonce: '7', chainId: 100 });
    view(); await view().props.children[2].props.onClick();
    expect(textOf(view())).toMatch(/still unconfirmed/);
    expect(listPendingSubmissions(ACCOUNT)).toHaveLength(1);
    expect(state.clients.publicClient.getTransactionReceipt).not.toHaveBeenCalled();
    expect(state.clients.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  });
  it('does not show a late success after account/organization scope changes', async () => {
    let current = true;
    const scoped = () => { if (!current) throw new Error('stale'); };
    seed({ phase: 'submitted', kind: 'transaction', nonce: '7', txHash: TX, chainId: 100 });
    state.clients.publicClient.getChainId.mockImplementation(async () => { current = false; return 100; });
    view(scoped); await view(scoped).props.children[2].props.onClick();
    expect(textOf(view(scoped))).not.toMatch(/Transaction confirmed/);
  });
});

async function seedV2({ unsent = false, known = false } = {}) {
  const { submissionIntentKey } = await import('@poa-box/core/execute/recovery');
  const journal = createSubmissionJournal({ accountAddress: ACCOUNT, chainId: 100, entryPoint: ENTRY_POINT_ADDRESS });
  const release = await journal.acquire();
  journal.begin(submissionIntentKey([{ to: ACCOUNT, data: '0x12345678', value: '0' }]));
  if (!unsent) {
    journal.write({ kind: 'transaction', phase: 'submitting', chainId: 100, nonce: '7', callKey: submissionIntentKey([{ to: ACCOUNT, data: '0x12345678', value: '0' }]), fromBlock: '40' });
    if (known) journal.write({ kind: 'transaction', phase: 'submitted', chainId: 100, nonce: '7', txHash: TX });
  }
  const record = journal.read(); await release(); return { journal, record };
}
function exactClient() {
  const blockHash = `0x${'dd'.repeat(32)}`;
  state.clients.publicClient.getTransaction = vi.fn(async () => ({ hash: TX, from: ACCOUNT, nonce: 7, chainId: 100,
    to: ACCOUNT, input: '0x12345678', value: 0n, blockNumber: 41n, blockHash }));
  state.clients.publicClient.getBlock = vi.fn(async () => ({ number: 41n, hash: blockHash }));
  state.clients.publicClient.getTransactionReceipt.mockResolvedValue({ transactionHash: TX, status: 'success', blockNumber: 41n, blockHash, logs: [] });
}
describe('mounted v2 coordinator recovery behavior', () => {
  it('reconciles an explicit exact hash without resending, and reports a different call separately', async () => {
    await seedV2(); exactClient();
    view(); let ui = view();
    ui.props.children[3].props.children[1].props.onChange({ target: { value: TX } });
    await view().props.children[2].props.onClick();
    expect(textOf(view())).toMatch(/Transaction confirmed/);
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    expect(state.clients.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    await seedV2({ known: true });
    window.addEventListener.mock.calls.find(([type]) => type === 'storage')[1]();
    state.clients.publicClient.getTransaction.mockResolvedValue({ ...(await state.clients.publicClient.getTransaction()), input: '0x87654321' });
    await view().props.children[2].props.onClick();
    expect(textOf(view())).toMatch(/different action/);
    expect(textOf(view())).not.toMatch(/Transaction confirmed/);
  });
  it('keeps a successful arbitrary hash for a different sender blocked', async () => {
    await seedV2(); exactClient();
    state.clients.publicClient.getTransaction.mockResolvedValue({ ...(await state.clients.publicClient.getTransaction()), from: ENTRY_POINT_ADDRESS });
    view(); view().props.children[3].props.children[1].props.onChange({ target: { value: TX } });
    await view().props.children[2].props.onClick();
    expect(textOf(view())).toMatch(/still unconfirmed/);
    expect(listPendingSubmissions(ACCOUNT)).toHaveLength(1);
  });
  it('retains a newer tab attempt when an old receipt check finishes late', async () => {
    const { journal, record } = await seedV2({ known: true }); exactClient();
    const receipt = await state.clients.publicClient.getTransactionReceipt();
    let changed = false;
    state.clients.publicClient.getTransactionReceipt.mockImplementation(async () => {
      if (changed) return receipt;
      changed = true;
      expect(await journal.clear(record)).toBe(true);
      const release = await journal.acquire();
      journal.begin(`0x${'ee'.repeat(32)}`);
      await release();
      return receipt;
    });
    view(); await view().props.children[2].props.onClick();
    expect(textOf(view())).toMatch(/Another tab/);
    expect(listPendingSubmissions(ACCOUNT)[0].recovery.attemptId).not.toBe(record.recovery.attemptId);
  });
  it('cancels only an unsent action under exclusive ownership', async () => {
    const { journal } = await seedV2({ unsent: true });
    view(); expect(view().props.children[2].props.children).toBe('Cancel unsent action');
    const release = await journal.acquire();
    await view().props.children[2].props.onClick();
    expect(listPendingSubmissions(ACCOUNT)).toHaveLength(1);
    expect(textOf(view())).toMatch(/Another tab/);
    await release(); await view().props.children[2].props.onClick();
    expect(textOf(view())).toMatch(/unsent action was cancelled/);
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    expect(state.clients.publicClient.getTransactionReceipt).not.toHaveBeenCalled();
  });
  it('keeps a pending check busy and ignores a duplicate click', async () => {
    await seedV2({ known: true }); exactClient();
    let finish;
    const receipt = await state.clients.publicClient.getTransactionReceipt();
    const gate = new Promise(done => { finish = done; });
    const reached = new Promise(resolve => { state.clients.publicClient.getTransactionReceipt.mockImplementation(() => { resolve(); return gate; }); });
    view(); const check = view().props.children[2].props.onClick;
    const first = check(); await reached; await check();
    expect(view().props.children[2].props.disabled).toBe(true);
    expect(state.clients.publicClient.getTransactionReceipt).toHaveBeenCalledTimes(2); // One fixture read and one live check.
    finish(receipt); await first;
    expect(textOf(view())).toMatch(/Transaction confirmed/);
  });
});
