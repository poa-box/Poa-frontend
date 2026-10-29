import { print } from 'graphql';

export const CASHOUT_TEST_HASH = `0x${'3'.repeat(64)}`;
export const CASHOUT_TEST_USER = `0x${'1'.repeat(40)}`;
const RELAY = '0xa65414a21dc114199cafd7c6c3ed99488eb9efe5';
const TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ESCROW = '0x777777779d229cdf3110e9de47943791c26300ef';
export function cashoutCandidate(row, status, account = CASHOUT_TEST_USER) {
  return { ...row, id: row.requestHash.toLowerCase(), depositor: { id: account },
    pendingFor: status === 'FAILED' ? { id: account } : null, status,
    createdAtBlock: '90', createdAtTimestamp: row.createdAtTimestamp || '100',
    createdTxHash: row.createdTxHash || CASHOUT_TEST_HASH, paymentMethod: row.paymentMethod || null, failureReason: null };
}

/** Serving schema, bounded Bytes cursors, and same-response block proof. */
export function cashoutGraph({ failed = [], deposited = [], alter } = {}) {
  return async ({ query, variables = {} }) => {
    const text = typeof query === 'string' ? query : print(query);
    const rows = variables.statuses?.includes('DEPOSITED') ? deposited : failed;
    const data = { _meta: { deployment: 'cashout-fixture', hasIndexingErrors: false,
      block: { number: 100, hash: CASHOUT_TEST_HASH, timestamp: 1000 } },
    ...(text.includes('CashoutDiscoveryState') ? {
      relayContract: { id: RELAY, usdc: TOKEN, escrow: ESCROW }, relayContracts: [{ id: RELAY }],
    } : { cashOutRequests: rows.filter(row => row.id > variables.cursor).sort((a, b) => a.id.localeCompare(b.id)).slice(0, variables.first) }) };
    return { data: alter ? alter(data, variables, text) : data };
  };
}
