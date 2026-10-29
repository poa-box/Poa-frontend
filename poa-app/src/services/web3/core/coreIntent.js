import { intentToExecutionRequest } from '@poa-box/core/tx/intent';

/**
 * Materialize core protocol intents inside the existing host service boundary.
 * Managers retain signing, lifecycle callbacks, scope guards and receipt ownership.
 */
export function executeCoreIntent(factory, txManager, intent, options = {}) {
  const request = intentToExecutionRequest(intent);
  const hostValue = options.value == null
    ? '0'
    : intentToExecutionRequest({ ...intent, value: options.value }).value;

  if (request.value !== '0' && hostValue !== '0' && request.value !== hostValue) {
    throw new Error('Conflicting native values in transaction intent and host options.');
  }

  const contract = factory.createWritable(request.to, request.abi);
  return txManager.execute(contract, request.method, request.args, {
    ...options,
    value: request.value !== '0' ? request.value : hostValue,
  });
}
