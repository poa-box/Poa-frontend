const isCoinbase = (connector) => connector?.type === 'coinbaseWallet'
  || /coinbase/i.test(connector?.id || '');

/**
 * Be conservative about returning accounts. These namespaces are used by the
 * installed Coinbase v4 SDK (including its WalletLink compatibility path).
 * Any existing SDK data warrants the normal probe, even if it might be stale.
 */
export function hasCoinbaseSessionEvidence(browser, state) {
  try {
    if (!browser) return true;
    if (browser.coinbaseWalletExtension || browser.ethereum?.isCoinbaseWallet
      || browser.ethereum?.providers?.some((provider) => provider.isCoinbaseWallet)) return true;
    if ([...(state?.connections?.values() || [])].some((connection) => isCoinbase(connection.connector))) return true;

    const storage = browser.localStorage;
    if (!storage) return true;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === 'cbwsdk.store' || key?.startsWith('-CBWSDK:') || key?.startsWith('-walletlink:')) return true;
      // RainbowKit writes rk-latest-id before requesting a QR provider and
      // before connect(). This also preserves a selection made mid-restore.
      if ((key === 'wagmi.recentConnectorId' || key === 'wagmi.store' || key === 'rk-latest-id')
        && /coinbase/i.test(storage.getItem(key) || '')) return true;
    }
    return false;
  } catch {
    // Storage-disabled browsers must keep their existing reconnect behavior.
    return true;
  }
}

/**
 * Wagmi reconnect asks every connector for its provider before isAuthorized.
 * Coinbase's provider lookup downloads its SDK, even on a fresh visit. Keep
 * wagmi's hydration/reconnect ordering and every wallet option, but avoid that
 * one empty-session probe. Explicit connects always use the original methods.
 */
export function deferEmptyCoinbaseProbe(connectorFactory, getState, getBrowser) {
  return (config) => {
    const connector = connectorFactory(config);
    if (!isCoinbase(connector)) return connector;
    let explicitlyRequested = false;
    return {
      ...connector,
      async getProvider(...args) {
        const state = getState();
        const restoring = state?.status === 'connecting' || state?.status === 'reconnecting';
        if (!explicitlyRequested && restoring && !hasCoinbaseSessionEvidence(getBrowser(), state)) return undefined;
        return connector.getProvider.apply(this, args);
      },
      async connect(...args) {
        // Set before calling through: connect invokes this.getProvider(), and
        // a manual connect may overlap the existing reconnect loop.
        explicitlyRequested = true;
        return connector.connect.apply(this, args);
      },
    };
  };
}
