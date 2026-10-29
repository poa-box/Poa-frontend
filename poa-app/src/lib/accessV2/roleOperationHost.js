/** Browser host transport only. Core owns role demand, observations and protocol decisions. */
import { assertRoleObservationActive, roleObservationKey, roleRead, shareRoleObservation } from '@/lib/accessV2/roleObservationWork';
import { createRoleTransportCache } from '@/lib/accessV2/roleObservationHistory';

const providers = new WeakMap();
const loadOperations = () => import('@poa-box/core/governance/role-operations');

export class RoleOperationUnavailable extends Error {
  constructor(result) {
    super('Current role settings could not be verified. Refresh and review them again.');
    this.name = 'RoleOperationUnavailable';
    this.code = 'ROLE_OPERATION_UNAVAILABLE';
    this.result = result;
  }
}
export function requireRoleOperation(result) {
  if (result?.status !== 'ready') throw new RoleOperationUnavailable(result);
  return result.data;
}

/** Injectable operations are for offline host-boundary tests. Production always loads the
 * installed public package. No ready evidence, ABI or planner is assembled here. */
export function createRoleOperationHost(readFactory, { operations } = {}) {
  const provider = readFactory.provider || readFactory.signer?.provider;
  let caches = providers.get(provider);
  if (!caches) { caches = { pending: new Map(), transport: new Map() }; providers.set(provider, caches); }
  const run = async (method, input, signal) => {
    const { query, endpoint, rpcEndpoint, now = () => Math.floor(Date.now() / 1000), snapshot, ...request } = input;
    const pinned = ['readRoleOperationEvidence', 'reviewRoleOperation', 'readRoleOperationStatus'].includes(method) ? snapshot : undefined;
    const blocks = new Map();
    if (pinned?.source.block?.hash) blocks.set(String(pinned.source.block.number), pinned.source.block);
    const transport = createRoleTransportCache(caches.transport, { scope: input.scope, endpoint,
      rpcEndpoint: provider.connection?.url || rpcEndpoint, now });
    const sources = { indexed: { endpoint: endpoint || snapshot?.source.endpoint,
      query: async (source, document, variables) => {
        const data = await roleRead(() => transport.read(['indexed', document, variables],
          () => query(document, variables, source), variables?.block?.hash ? { hash: variables.block.hash }
            : blocks.get(String(variables?.block?.number))), signal);
        // apolloProtocolQuery already rejects transport/GraphQL issues before cache
        // normalization. Core validates the actual response's _meta against this source.
        return { source, data, issues: [] };
      } },
    rpc: { endpoint: provider.connection?.url || rpcEndpoint,
      provider: Object.fromEntries(['call', 'getNetwork', 'getBlock', 'getTransaction', 'getTransactionReceipt'].map(name => [name,
        (...args) => roleRead(async () => {
          const pin = name === 'call' ? blocks.get(String(args[1]))
            : name === 'getTransaction' || name === 'getTransactionReceipt' ? 'exact-transaction' : undefined;
          const value = await transport.read(['rpc', name, args], () => provider[name](...args), pin);
          if (name === 'getBlock' && value?.hash && value.number != null) blocks.set(String(value.number), { number: String(value.number), hash: value.hash });
          return value;
        }, signal)])) }, now };
    const api = operations || await loadOperations();
    assertRoleObservationActive(signal);
    try {
      const result = await api[method]({ ...request, sources,
        ...(pinned ? { authoritySnapshot: pinned } : {}), signal });
      assertRoleObservationActive(signal);
      if (result.status === 'ready') await transport.commit(); else transport.discard();
      assertRoleObservationActive(signal);
      return result;
    } catch (error) { transport.discard(); throw error; }

  };
  return {
    read(input) {
      const { signal, now = () => Math.floor(Date.now() / 1000) } = input;
      const key = roleObservationKey(['read', input.purpose ?? 'operation', input.scope, input.endpoint || input.snapshot?.source.endpoint,
        provider.connection?.url || input.rpcEndpoint, input.snapshot?.source.block, input.snapshot?.data, input.request, input.bounds]);
      return shareRoleObservation(caches.pending, key, workSignal => run('readRoleOperationEvidence', input, workSignal), { signal, now });
    },
    review(input) {
      const key = roleObservationKey(['review', input.scope, input.endpoint || input.snapshot?.source.endpoint,
        provider.connection?.url || input.rpcEndpoint, input.snapshot?.source.block, input.snapshot?.data, input.request, input.bounds]);
      return shareRoleObservation(caches.pending, key, signal => run('reviewRoleOperation', input, signal), { signal: input.signal, now: input.now });
    },
    prepare: input => run('prepareRoleOperation', input, input.signal),
    revalidate: input => run('revalidatePreparedRoleOperation', input, input.signal),
    status(input) {
      const key = roleObservationKey(['status', input.scope, input.endpoint || input.snapshot?.source.endpoint,
        provider.connection?.url || input.rpcEndpoint, input.snapshot?.source.block, input.creation, input.configuration]);
      return shareRoleObservation(caches.pending, key, signal => run('readRoleOperationStatus', input, signal), { signal: input.signal, now: input.now });
    },
  };
}
