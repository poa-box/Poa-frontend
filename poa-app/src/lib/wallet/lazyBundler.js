/**
 * The async bundler operations used by Poa's transaction/onboarding services.
 * This is deliberately a small application interface, not a viem Client proxy:
 * callers needing additional client fields/actions must add them explicitly.
 */
export function createLazyBundler(loadClient) {
  let pendingClient;
  const getClient = () => {
    if (!pendingClient) {
      pendingClient = Promise.resolve().then(loadClient).catch((error) => {
        pendingClient = undefined;
        throw error;
      });
    }
    return pendingClient;
  };
  const call = async (method, args) => {
    const client = await getClient();
    return client[method].apply(client, args);
  };
  return {
    estimateUserOperationGas: (...args) => call('estimateUserOperationGas', args),
    getUserOperationGasPrice: (...args) => call('getUserOperationGasPrice', args),
    sendUserOperation: (...args) => call('sendUserOperation', args),
    waitForUserOperationReceipt: (...args) => call('waitForUserOperationReceipt', args),
  };
}
