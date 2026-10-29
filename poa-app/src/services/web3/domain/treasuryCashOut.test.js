import { describe, it, expect, vi, beforeEach } from 'vitest';
import { utils } from 'ethers';
import { cashoutGraph, cashoutCandidate } from '@/test/cashoutGraphFixture';
import { CASHOUT_ESCROW_ABI_V1 } from '@poa-box/core/integrations/cashout';

const mocks = vi.hoisted(() => ({ rpc: { getTransactionReceipt: vi.fn(), multicall: vi.fn(), getChainId: vi.fn(), getBlock: vi.fn() }, apollo: { query: vi.fn() } }));
vi.mock('viem', async () => ({ ...await vi.importActual('viem'), createPublicClient: () => mocks.rpc }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => mocks.apollo }));
import { encodeCashOutPayload, prepareCashOut, buildWithdrawDeposit, buildRecoverFailed, fetchOutstandingDeposits,
  ESCROW_V2_ADDRESS, CASHOUT_RELAY_ADDRESS, USDC_BASE, BASE_CHAIN_ID } from '@/services/web3/domain/CashOutService';

const USER = `0x${'1'.repeat(40)}`, OTHER = `0x${'2'.repeat(40)}`, HASH = `0x${'3'.repeat(64)}`, REQUEST = `0x${'4'.repeat(64)}`;
const payload = { depositor: USER, platform: 'venmo', payeeDetailsHash: HASH, maxIntentAmount: 1234567n };
const iface = new utils.Interface([...CASHOUT_ESCROW_ABI_V1]);
function deposit({ who = USER, token = USDC_BASE, emitter = ESCROW_V2_ADDRESS, id = '7', index = 1 } = {}) {
  const event = iface.encodeEventLog(iface.getEvent('DepositReceived'), [id, who, token, '1234567', ['1000000', '1234567'], OTHER, OTHER]);
  return { ...event, address: emitter, transactionHash: HASH, logIndex: index };
}
const deposited = { requestHash: REQUEST, amount: '1234567', createdTxHash: HASH, createdAtTimestamp: '100', paymentMethod: null };
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals();
  mocks.rpc.getChainId.mockResolvedValue(8453);
  mocks.rpc.getBlock.mockResolvedValue({ number: 100n, hash: HASH });
  mocks.apollo.query.mockImplementation(cashoutGraph());
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});

describe('isolated external cashout schema adoption', () => {
  it('preserves the exact seven-field 224-byte payload with six-decimal USDC and 18-decimal rate', () => {
    const encoded = encodeCashOutPayload(payload);
    expect((encoded.length - 2) / 2).toBe(224);
    const decoded = utils.defaultAbiCoder.decode(['address', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256'], encoded);
    expect(decoded[0]).toBe(USER);
    expect(decoded[1]).toBe(utils.id('venmo'));
    expect(decoded[2]).toBe(HASH);
    expect(decoded[3]).toBe(utils.id('USD'));
    expect(decoded.slice(4).map(v => v.toString())).toEqual(['980000000000000000', '1000000', '1234567']);
    const large = encodeCashOutPayload({ ...payload, minIntentAmount: 1n, maxIntentAmount: 9007199254740993n });
    expect(utils.defaultAbiCoder.decode(['address', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256'], large)[6].toString()).toBe('9007199254740993');
  });
  it('rejects invalid payee/address, rate, range, and platform before quoting', () => {
    for (const input of [{ ...payload, depositor: '0x123' }, { ...payload, payeeDetailsHash: '0x12' },
      { ...payload, conversionRate: 0n }, { ...payload, maxIntentAmount: 999999n }, { ...payload, platform: 'unsupported' }]) {
      expect(() => encodeCashOutPayload(input)).toThrow();
    }
  });
  it('places the validated payload in the quote before signing and preserves the witness through submission', async () => {
    const witness = { destinationPayload: encodeCashOutPayload(payload), receiver: CASHOUT_RELAY_ADDRESS };
    const quote = { signTypedData: { domain: { chainId: 42161 }, types: {}, values: { witness, permitted: { amount: 1234567n } } },
      quoteId: 'mock-quote', requestType: 'SINGLE_OUTPUT_REQUEST', requestHash: REQUEST };
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, responseObject: { hashedOnchainId: HASH } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: { autoRoute: quote } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: { requestHash: REQUEST } }) });
    vi.stubGlobal('fetch', fetcher);
    const prepared = await prepareCashOut({ amountWei: 1234567n, userAddress: USER, platform: 'venmo', payeeHandle: 'offline-fixture' });
    const quoted = new URL(fetcher.mock.calls[1][0]);
    expect(quoted.searchParams.get('destinationPayload')).toBe(witness.destinationPayload);
    expect(quoted.searchParams.get('inputAmount')).toBe('1234567');
    expect(prepared.typedData.message.witness).toEqual(witness);
    expect(prepared.approval.amount).toBe(1234567n);
    expect(await prepared.submit('mock-signature')).toEqual({ requestHash: REQUEST });
    expect(JSON.parse(fetcher.mock.calls[2][1].body).request).toEqual(witness);
  });
  it('keeps recovery transaction shapes and Base binding while core owns the selectors', () => {
    const withdraw = buildWithdrawDeposit('9007199254740993');
    expect(withdraw).toMatchObject({ chainId: BASE_CHAIN_ID, to: ESCROW_V2_ADDRESS, value: 0n });
    expect(iface.decodeFunctionData('withdrawDeposit', withdraw.data)[0].toString()).toBe('9007199254740993');
    const recover = buildRecoverFailed(REQUEST);
    expect(recover).toMatchObject({ chainId: BASE_CHAIN_ID, to: CASHOUT_RELAY_ADDRESS, value: 0n });
    expect(recover.data).toBe(new utils.Interface(['function recoverFailed(bytes32)']).encodeFunctionData('recoverFailed', [REQUEST]));
  });
  it('matches the emitter, depositor and token instead of selecting the first receipt event', async () => {
    mocks.apollo.query.mockImplementation(cashoutGraph({ deposited: [cashoutCandidate(deposited, 'DEPOSITED')] }));
    mocks.rpc.getTransactionReceipt.mockResolvedValue({ status: 'success', transactionHash: HASH, blockNumber: 90n, blockHash: HASH, logs: [deposit({ who: OTHER }), deposit({ emitter: OTHER }), deposit({ token: OTHER }), deposit()] });
    mocks.rpc.multicall.mockResolvedValue([{ status: 'success', result: { depositor: USER, token: USDC_BASE, remainingDeposits: 1n, outstandingIntentAmount: 0n } }]);
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows[0]).toMatchObject({ kind: 'unfilled', depositId: 7n, remainingAmount: 1n });
    expect(rows.coverage.status).toBe('complete');
    expect(mocks.rpc.multicall.mock.calls[0][0].contracts[0].args).toEqual([7n]);
  });
  it('retains both row kinds and reports unknown/ambiguous receipt evidence separately from known empty', async () => {
    mocks.apollo.query.mockImplementation(cashoutGraph({ failed: [cashoutCandidate({ ...deposited, requestHash: HASH }, 'FAILED')], deposited: [cashoutCandidate(deposited, 'DEPOSITED')] }));
    mocks.rpc.multicall.mockImplementation(async ({ contracts }) => contracts[0].functionName === 'failedDepositor'
      ? [{ status: 'success', result: USER }, { status: 'success', result: 1234567n }, { status: 'success', result: USDC_BASE }]
      : [{ status: 'success', result: { depositor: USER, token: USDC_BASE, remainingDeposits: 0n, outstandingIntentAmount: 0n } }]);
    mocks.rpc.getTransactionReceipt.mockResolvedValue({ status: 'success', transactionHash: HASH, blockNumber: 90n, blockHash: HASH, logs: [deposit(), deposit({ id: '8', index: 2 })] });
    const ambiguous = await fetchOutstandingDeposits(USER);
    expect(ambiguous.map(r => r.kind)).toEqual(['failed']);
    expect(ambiguous.coverage.status).toBe('incomplete');
    expect(ambiguous.coverage.issues).toContainEqual({ code: 'AMBIGUOUS_DEPOSIT_EVENT', id: REQUEST });
    mocks.rpc.getTransactionReceipt.mockResolvedValue({ status: 'success', transactionHash: HASH, blockNumber: 90n, blockHash: HASH, logs: [deposit()] });
    expect((await fetchOutstandingDeposits(USER)).map(r => r.kind)).toEqual(['failed']);
    mocks.apollo.query.mockRejectedValue(new Error('offline source failure'));
    await expect(fetchOutstandingDeposits(USER)).rejects.toThrow('unavailable');
  });
});
