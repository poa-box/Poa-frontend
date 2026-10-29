import { requireRawUint, sumRawAssetAmounts } from '@poa-box/core/amounts';
import { requireCompleteSnapshot, assertSourceBlock } from '@poa-box/core/data/facts';

/** Exact, asset-separated indexed totals. Presentation and token names belong to the host. */
export function treasuryHistorySummary(facts, assets) {
  try {
    const payments = requireCompleteSnapshot(facts.payments, { snapshot: 'pinned' });
    const distributions = requireCompleteSnapshot(facts.distributions, { snapshot: 'pinned' });
    assertSourceBlock(facts.payments.source.block, facts.distributions.source.block);
    assertSourceBlock(facts.distributions.source.block, facts.payments.source.block);
    const registry = new Map(assets.map(asset => [asset.address.toLowerCase(), asset]));
    const resolve = address => {
      const asset = registry.get(String(address).toLowerCase());
      if (!asset || asset.chainId !== facts.payments.source.chainId) throw new Error('Asset units unavailable');
      return asset;
    };
    const total = (rows, tokenKey, amountKey) => sumRawAssetAmounts(rows.map(row => ({ asset: resolve(row[tokenKey]), rawAmount: requireRawUint(row[amountKey]) })));
    const received = total(payments, 'token', 'amount'), distributed = total(distributions, 'payoutToken', 'totalAmount'), claimed = total(distributions, 'payoutToken', 'totalClaimed');
    const addresses = new Set([...received, ...distributed, ...claimed].map(t => t.asset.address.toLowerCase()));
    const pick = (totals, address) => totals.find(t => t.asset.address.toLowerCase() === address)?.rawAmount || '0';
    return { state: 'known', paymentCount: payments.length, distributionCount: distributions.length,
      assets: [...addresses].map(address => {
        const totalReceived = pick(received, address), totalDistributed = pick(distributed, address), totalClaimed = pick(claimed, address);
        const all = BigInt(totalDistributed), paid = BigInt(totalClaimed);
        if (paid > all) throw new Error('Inconsistent claims');
        return { asset: registry.get(address), totalReceived, totalDistributed, totalClaimed,
          claimRate: all > 0n ? ((paid * 100n + all / 2n) / all).toString() : '0' };
      }) };
  } catch { return { state: 'unknown' }; }
}
