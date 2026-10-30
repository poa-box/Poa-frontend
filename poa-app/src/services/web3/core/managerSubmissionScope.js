import { BigNumber } from 'ethers';
import { submissionIntentKey } from '@poa-box/core/execute/recovery';

import { intentToExecutionRequest } from '@poa-box/core/tx/intent';

// Private in-process capability: only the 7702 host's actual fallback call receives it.
export const DELEGATED_SUBMISSION_LEASE = Symbol('delegated submission lease');

/** Revalidate host review state after async setup and again after a signing prompt. */
export async function assertBeforeSend(manager, beforeSend) {
  manager.assertCurrent();
  if (beforeSend) await beforeSend();
  manager.assertCurrent();
}
export function managerIntentKey(name, args) {
  const call = (contract, method, values = [], options = {}) => ({
    to: contract.address, data: contract.interface.encodeFunctionData(method, values), value: intentToExecutionRequest({ value: options.value }).value,
  });
  return submissionIntentKey(name === 'execute'
    ? [call(args[0], args[1], args[2], args[3])]
    : args[0].map(tx => call(tx.contract, tx.method, tx.args, { value: tx.options?.value ?? tx.value ?? '0' })));
}

/** Retain reviewed ABI input values before browser locks or wallet prompts yield.
 * Contract/manager objects and lifecycle callbacks remain owned by the host. */
export function snapshotCallValue(value) {
  if (value == null || typeof value !== 'object' || BigNumber.isBigNumber(value)) return value;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (Array.isArray(value)) return value.map(snapshotCallValue);
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotCallValue(item)]));
  }
  throw new Error('This action contains unsupported transaction arguments.');
}

export function snapshotExecutionArguments(name, args) {
  const options = value => value == null ? value : { ...value,
    ...(value.value === undefined ? {} : { value: snapshotCallValue(value.value) }) };
  if (name === 'execute') return [args[0], args[1], snapshotCallValue(args[2] ?? []), options(args[3])];
  return [args[0].map(tx => ({ ...tx,
    ...(tx.args === undefined ? {} : { args: snapshotCallValue(tx.args) }),
    ...(tx.value === undefined ? {} : { value: snapshotCallValue(tx.value) }),
    ...(tx.options === undefined ? {} : { options: options(tx.options) }),
  })), options(args[1])];
}
