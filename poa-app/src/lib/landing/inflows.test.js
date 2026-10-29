import { describe, expect, it } from 'vitest';
import { addressTopic, aggregateChainInflows, formatInflowAmount, summarizeInflows, TRANSFER_TOPIC, ZERO_ADDRESS } from '@/lib/landing/inflows';
import { NETWORKS } from '@/config/networks';
import { getBountyTokenOptions } from '@/util/tokens';
import { readInflowTransferChunks } from '@/services/web3/domain/LandingInflowService';

const treasury = `0x${'1'.repeat(40)}`;
const tasks = `0x${'2'.repeat(40)}`;
const executor = `0x${'3'.repeat(40)}`;
const paymaster = `0x${'4'.repeat(40)}`;
const user = `0x${'5'.repeat(40)}`;
const usdc = `0x${'a'.repeat(40)}`;
const bread = `0x${'b'.repeat(40)}`;
const native = { symbol: 'xDAI', decimals: 18, usdPegged: true };
const tokens = [
  { address: usdc, decimals: 6, isStable: true },
  { address: bread, decimals: 18, isStable: true },
];
const emptyData = () => ({
  taskManagers: [{ id: tasks }], paymentManagerContracts: [{ id: treasury }],
  executorContracts: [{ id: executor }], paymasterHubContracts: [{ id: paymaster }],
  payments: [], paymasterDepositEvents: [], solidarityEvents: [],
});
const log = ({ token = bread, from = user, to = treasury, amount = 1n * 10n ** 18n, tx = '0x1', index = '0x0' } = {}) => ({
  address: token, topics: [TRANSFER_TOPIC, addressTopic(from), addressTopic(to)],
  data: `0x${amount.toString(16)}`, transactionHash: `0x${tx.slice(2).padStart(64, '0')}`, logIndex: index, blockNumber: '0x32',
});
const inflowEvidence = (data, head = '100') => {
  const block = { number: head };
  const source = { chainId: 100, endpoint: 'https://index.invalid', method: 'graphql', indexed: true, snapshot: 'pinned', block };
  const coverage = { status: 'complete', receivedKeys: [], failedIds: [], missingIds: [], issues: [] };
  const pot = (collection, kind) => ({ source, coverage, data: data[collection].map(p => ({
    address: p.id, kind, chainId: 100, createdAtBlock: p.createdAtBlock || '1',
    ...(kind === 'paymaster-hub' ? {} : { orgId: `0x${'9'.repeat(64)}` }),
  })) });
  const pots = { 'task-manager': pot('taskManagers', 'task-manager'), 'payment-manager': pot('paymentManagerContracts', 'payment-manager'),
    executor: pot('executorContracts', 'executor'), 'paymaster-hub': pot('paymasterHubContracts', 'paymaster-hub') };
  const streams = ['payments', 'paymasterDepositEvents', 'solidarityEvents'].map(collection => ({ source, coverage,
    data: { collection, fromBlock: '1', toBlock: head, rows: data[collection] } }));
  return { pots, streams, block, fromBlock: '1', logSource: { ...source, endpoint: 'https://rpc.invalid', method: 'eth_getLogs', indexed: false }, logCoverage: coverage };
};
const payment = (amount = '1000000000000000000') => ({ id: '0x01', token: ZERO_ADDRESS, payer: user, amount,
  receivedAtBlock: '50', transactionHash: `0x${'1'.repeat(64)}`, paymentManager: { id: treasury, organization: { id: `0x${'9'.repeat(64)}` } } });
const deposit = (amount, extra = {}) => ({ id: '0x02', eventType: 'OrgDeposit', from: user, amount,
  eventAtBlock: '50', transactionHash: `0x${'2'.repeat(64)}`, paymasterHub: { id: paymaster }, ...extra });
const aggregate = (data, transferLogs, nativeCurrency = native) => aggregateChainInflows({
  data, transferLogs, tokens, network: { chainId: 100, nativeCurrency }, evidence: inflowEvidence(data),
});

describe('recorded landing inflows', () => {
  it('includes the configured BREAD token in the dollar total at its peg', () => {
    const gnosisTokens = getBountyTokenOptions(NETWORKS.gnosis.chainId);
    const breadToken = gnosisTokens.find(({ symbol }) => symbol === 'BREAD');
    const result = aggregateChainInflows({
      data: emptyData(), network: NETWORKS.gnosis, tokens: gnosisTokens, evidence: inflowEvidence(emptyData()),
      transferLogs: [log({ token: breadToken.address, amount: 140_400_000_000_000_000_000n })],
    });
    expect(summarizeInflows([result])).toEqual({ formattedUsd: '$140.40' });
  });

  it('includes treasury, direct task bounty and executor deposits with actual token decimals', () => {
    const data = emptyData();
    // The subgraph's ERC20 Payment event duplicates this USDC Transfer.
    // Canonical native stream excludes this ERC20 Payment; only Transfer counts it.
    const result = aggregate(data, [
      log({ token: usdc, amount: 20_000_000n }),
      log({ to: tasks, amount: 40n * 10n ** 18n, tx: '0x2' }),
      log({ to: executor, amount: 10n ** 18n / 2n, tx: '0x3' }),
    ]);
    expect(result.USD).toBe(60_500_000_000_000_000_000n);
    expect(summarizeInflows([result]).formattedUsd).toBe('$60.50');
  });

  it('counts native treasury, gas sponsorship and solidarity donations once', () => {
    const data = emptyData();
    data.payments = [payment()];
    const gas = deposit('2000000000000000000');
    data.paymasterDepositEvents = [gas, gas];
    data.solidarityEvents = [deposit('5000000000000000000', { id: '0x03', eventType: 'DonationReceived' })];
    expect(aggregate(data, []).USD).toBe(8n * 10n ** 18n);
  });

  it('excludes internal movements and duplicate logs', () => {
    const data = emptyData();
    data.paymasterDepositEvents = [deposit('2000000000000000000', { from: executor })];
    const incoming = log({ amount: 10n * 10n ** 18n });
    expect(aggregate(data, [
      incoming, incoming,
      log({ from: treasury, to: tasks, amount: 10n * 10n ** 18n, tx: '0x2' }),
    ]).USD).toBe(10n * 10n ** 18n);
  });

  it('preserves gross inflows when a bundler includes unrelated payouts in the same transaction', () => {
    expect(aggregate(emptyData(), [
      log({ from: tasks, to: user, amount: 20n * 10n ** 18n }),
      log({ token: usdc, from: user, to: treasury, amount: 20_000_000n, index: '0x1' }),
    ]).USD).toBe(20n * 10n ** 18n);
  });

  it('keeps historical deposits after withdrawal and ignores spam tokens and removed logs', () => {
    const data = emptyData();
    expect(aggregate(data, [
      log({ amount: 10n * 10n ** 18n }),
      log({ from: treasury, to: user, amount: 10n * 10n ** 18n, tx: '0x2' }),
      log({ token: `0x${'f'.repeat(40)}`, amount: 999999n * 10n ** 18n, tx: '0x3' }),
      { ...log({ amount: 999999n * 10n ** 18n, tx: '0x4' }), removed: true },
    ]).USD).toBe(10n * 10n ** 18n);
  });

  it('converts ETH to dollars before combining production chains', () => {
    const data = emptyData();
    data.paymasterDepositEvents = [deposit('51859000000000000')];
    const eth = aggregate(data, [], { symbol: 'ETH', decimals: 18 });
    expect(summarizeInflows([{ USD: 20n * 10n ** 18n }, eth], { ETH: '3000' })).toEqual({
      formattedUsd: '$175.58',
    });
  });

  it('retains fractional price precision and rounds the combined total only once', () => {
    expect(summarizeInflows([{ USD: 20n * 10n ** 18n, ETH: 10n ** 16n }], { ETH: '3000.5' }))
      .toEqual({ formattedUsd: '$50.01' });
    expect(summarizeInflows([{ USD: 20_004_000_000_000_000_000n, ETH: 4n * 10n ** 12n }], { ETH: '1000' }))
      .toEqual({ formattedUsd: '$20.01' });
  });

  it('never silently omits native deposits when a USD quote is missing or invalid', () => {
    for (const rate of [undefined, '0', '-1', 'NaN', 'Infinity', '1e3', '1.2.3', 3000]) {
      expect(() => summarizeInflows([{ USD: 20n * 10n ** 18n, ETH: 10n ** 18n }], { ETH: rate }))
        .toThrow('exchange rate unavailable');
    }
    expect(summarizeInflows([{ USD: 20n * 10n ** 18n, ETH: 0n }])).toEqual({ formattedUsd: '$20.00' });
  });
});

describe('inflow formatting', () => {
  it('formats wei, fractional deposits and very large amounts without losing integer precision', () => {
    expect(formatInflowAmount(1n)).toBe('<0.01');
    expect(formatInflowAmount(1n, 6)).toBe('<0.000001');
    expect(formatInflowAmount(1_999_000_000_000_000_000n)).toBe('2');
    expect(formatInflowAmount(9_007_199_254_740_993n * 10n ** 18n)).toBe('9,007,199,254,740,993');
    expect(summarizeInflows([{}])).toEqual({ formattedUsd: '$0.00' });
    expect(summarizeInflows([{ USD: 1n }])).toEqual({ formattedUsd: '<$0.01' });
  });
});

describe('canonical inflow evidence', () => {
  it('accounts nonempty bounded ranges through core, deduplicating transfers and excluding internal movements', async () => {
    const logs = [
      { ...log({ token: usdc, amount: 10_000_001n }), blockNumber: '0x5' },
      { ...log({ to: tasks, amount: 7n * 10n ** 18n, tx: '0x2' }), blockNumber: `0x${(10_000_001).toString(16)}` },
      { ...log({ from: treasury, to: executor, amount: 100n * 10n ** 18n, tx: '0x3' }), blockNumber: `0x${(20_000_001).toString(16)}` },
      { ...log({ token: usdc, to: executor, amount: 2_000_002n, tx: '0x4' }), blockNumber: `0x${(20_000_001).toString(16)}` },
    ];
    let active = 0, maximum = 0, requests = 0;
    const rpc = async (_method, [filter]) => {
      requests++; maximum = Math.max(maximum, ++active);
      await Promise.resolve(); active--;
      const selected = logs.filter(event => event.address === filter.address && event.topics[2] === filter.topics[2]
        && BigInt(event.blockNumber) >= BigInt(filter.fromBlock) && BigInt(event.blockNumber) <= BigInt(filter.toBlock));
      return [...selected, ...selected];
    };
    const chunks = await readInflowTransferChunks({ rpc, tokens,
      contracts: [treasury, tasks, executor].map(address => ({ address })), fromBlock: '1', toBlock: '20000001' });
    expect(requests).toBe(18); expect(maximum).toBe(4);
    const evidence = { ...inflowEvidence(emptyData(), '20000001'), transferChunks: chunks };
    const aggregateChunks = supplied => aggregateChainInflows({ transferLogs: supplied.flatMap(chunk => chunk.logs), tokens,
      network: { chainId: 100, nativeCurrency: native }, evidence: { ...evidence, transferChunks: supplied } });
    expect(aggregateChunks(chunks).USD).toBe(19_000_003_000_000_000_000n);
    expect(() => aggregateChunks([chunks[0], chunks[2]])).toThrow('incomplete');
  });
  it('rejects conflicting observations, incomplete chunks and unknown event block numbers', () => {
    const data = emptyData(), evidence = inflowEvidence(data);
    const incoming = log();
    expect(() => aggregate(data, [incoming, { ...incoming, data: '0x2' }])).toThrow('incomplete');
    expect(() => aggregate(data, [{ ...incoming, blockNumber: undefined }])).toThrow();
    expect(() => aggregateChainInflows({ data, transferLogs: [], network: { chainId: 100, nativeCurrency: native }, tokens,
      evidence: { ...evidence, logCoverage: { ...evidence.logCoverage, status: 'incomplete' } } })).toThrow('incomplete');
  });
  it('keeps an externally linked return as recorded gross inflow without claiming causal revenue', () => {
    const external = `0x${'6'.repeat(40)}`;
    expect(aggregate(emptyData(), [log({ from: treasury, to: external, amount: 10n, index: '0x0' }),
      log({ from: external, to: tasks, amount: 7n, index: '0x1' })]).USD).toBe(7n);
  });
});

describe('indexed native and historical hub integration', () => {
  it('counts distinct opaque events in one transaction and deduplicates repeated observations exactly', () => {
    const data = emptyData();
    data.solidarityEvents = [deposit('9007199254740993', { eventType: 'DonationReceived' }),
      deposit('9007199254740993', { id: '0xabcdef', eventType: 'DonationReceived' })];
    data.solidarityEvents.push(data.solidarityEvents[0]);
    expect(aggregate(data, []).USD).toBe(18014398509481986n);
    data.solidarityEvents.push({ ...data.solidarityEvents[0], amount: '1' });
    expect(() => aggregate(data, [])).toThrow('incomplete');
  });
  it('excludes ERC20 movements among former hubs and org pots while preserving external hub deposits', () => {
    const data = emptyData();
    expect(aggregate(data, [log({ to: paymaster, amount: 7n }),
      log({ from: paymaster, to: tasks, amount: 7n, index: '0x1' }),
      log({ from: treasury, to: paymaster, amount: 3n, index: '0x2' })]).USD).toBe(7n);
  });
  it('fails closed for wrong destination/org, missing native page, and events predating their hub', () => {
    const data = emptyData(); data.payments = [payment()];
    data.payments[0].paymentManager.organization.id = `0x${'8'.repeat(64)}`;
    expect(() => aggregate(data, [])).toThrow('incomplete');
    data.payments = []; data.paymasterHubContracts[0].createdAtBlock = '60';
    data.paymasterDepositEvents = [deposit('1')];
    expect(() => aggregate(data, [])).toThrow('incomplete');
    data.paymasterDepositEvents = []; const evidence = inflowEvidence(data);
    evidence.streams.pop();
    expect(() => aggregateChainInflows({ transferLogs: [], tokens, network: { chainId: 100, nativeCurrency: native }, evidence })).toThrow('incomplete');
  });
});
