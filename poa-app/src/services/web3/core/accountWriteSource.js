import { readIdentityFacts } from '@poa-box/core/reads/identity';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@poa-box/core/graph/documents/infrastructure';
import { createApolloProtocolQuery } from '@/lib/graphql/coreQuery';
import { getAllSubgraphUrls } from '@/config/networks';

/** Action-only lookup. Ranking stays local; chain and registry come from the indexed account. */
export async function resolveAccountWriteSource(address, { purpose = 'username', query = createApolloProtocolQuery({ fetchPolicy: 'network-only' }), sources = getAllSubgraphUrls(), guard = () => {} } = {}) {
  guard();
  const registries = await Promise.all(sources.map(async source => {
    const scope = { chainId: source.chainId, endpoint: source.url, indexed: true, snapshot: 'latest', method: 'graph' };
    const infra = await query(FETCH_INFRASTRUCTURE_ADDRESSES, {}, scope);
    const registry = infra?.universalAccountRegistries?.[0]?.id;
    if (!/^0x[0-9a-f]{40}$/i.test(registry || '') || /^0x0{40}$/i.test(registry)) throw new Error('Account information is unavailable. Please try again.');
    return { ...scope, contract: registry };
  }));
  guard();
  const facts = await readIdentityFacts({ sources: registries, query,
    selector: { kind: 'addresses', addresses: [address.toLowerCase()] } });
  guard();
  // A partial source sweep cannot safely choose which registration/profile the form represents.
  if (facts.coverage.status !== 'complete') throw new Error('Account information is incomplete. Please try again.');
  const rows = facts.data.filter(row => !row.isDeleted && row.username);
  const score = row => ['bio', 'avatar', 'github', 'twitter', 'website'].filter(field => row.metadata?.[field]).length;
  const selected = purpose === 'profile'
    ? rows.reduce((best, row) => !best || score(row) > score(best) ? row : best, null)
    : rows[0];
  if (!selected) throw new Error('No registered account was found. Please sign in again.');
  return { source: selected.source, metadata: selected.metadata, username: selected.username };
}
