// Decentralized verified IPFS retrieval for the browser.
//
// Uses @helia/http + @helia/verified-fetch to discover content providers via
// delegated HTTP routing, fetch raw blocks from trustless gateways, and verify
// every block client-side against the requested CID. Not locked to a single
// gateway — if one is down or serves tampered bytes, the client rejects it
// and tries the next provider.
//
// We load the helia packages from esm.sh at runtime rather than declaring them
// as npm deps for two reasons:
//   1. The current helia/libp2p npm dep tree has unresolvable version chains
//      (packages reference minor versions of libp2p that haven't been published
//      yet), which makes `yarn install` fail and breaks Next.js webpack's
//      static analysis. esm.sh resolves the tree server-side and serves a
//      working ESM bundle.
//   2. The ~300 KB of helia/libp2p code lives outside our main bundle and
//      only loads on the first IPFS fetch.
//
// If esm.sh is unreachable or the init fails for any reason, the whole path
// is marked `disabled: true` and every subsequent fetch falls back to the
// existing HTTP gateway (see hybridFetch.js) — the user never sees a failure
// that was avoidable.
const HELIA_HTTP_URL = 'https://esm.sh/@helia/http@3.1.3';
const VERIFIED_FETCH_URL = 'https://esm.sh/@helia/verified-fetch@7.2.7';
const BLOCK_BROKERS_URL = 'https://esm.sh/@helia/block-brokers@5.2.3';
const ROUTERS_URL = 'https://esm.sh/@helia/routers@5.1.1';
const BLOCKSTORE_IDB_URL = 'https://esm.sh/blockstore-idb@3.0.2';
const DATASTORE_IDB_URL = 'https://esm.sh/datastore-idb@4.0.2';

// Trustless gateways tried after delegated routing. These must support the
// IPFS Trustless Gateway spec (Accept: application/vnd.ipld.raw). The client
// fetches raw blocks, hashes them locally, and rejects any response whose
// hash does not match the requested CID — so listing a gateway here is not
// a trust decision, just a hint of where to look first.
//
// Prepend your own endpoint (a Pinata dedicated gateway, a self-hosted kubo
// node with CORS enabled, etc.) to prioritize it for first-byte latency on
// your own content.
const TRUSTLESS_GATEWAYS = [
  'https://trustless-gateway.link',
  'https://gateway.pinata.cloud',
];

// IPFS Foundation's public delegated routing endpoint. Returns a live list
// of providers for any CID, queried from the IPFS DHT and other routing
// systems. Free to use, no auth, and what @helia/verified-fetch uses by
// default — we name it explicitly for clarity.
const DELEGATED_ROUTING_URL = 'https://delegated-ipfs.dev';

let heliaPromise = null;

export function getVerifiedFetch() {
  if (heliaPromise) return heliaPromise;

  heliaPromise = (async () => {
    if (typeof window === 'undefined') return { disabled: true };
    if (typeof indexedDB === 'undefined') return { disabled: true };

    try {
      const [
        { createHeliaHTTP },
        { createVerifiedFetch },
        { trustlessGateway },
        { delegatedHTTPRouting, httpGatewayRouting },
        { IDBBlockstore },
        { IDBDatastore },
      ] = await Promise.all([
        import(/* webpackIgnore: true */ HELIA_HTTP_URL),
        import(/* webpackIgnore: true */ VERIFIED_FETCH_URL),
        import(/* webpackIgnore: true */ BLOCK_BROKERS_URL),
        import(/* webpackIgnore: true */ ROUTERS_URL),
        import(/* webpackIgnore: true */ BLOCKSTORE_IDB_URL),
        import(/* webpackIgnore: true */ DATASTORE_IDB_URL),
      ]);

      const blockstore = new IDBBlockstore('poa-helia-blocks');
      await blockstore.open();
      const datastore = new IDBDatastore('poa-helia-data');
      await datastore.open();

      const helia = await createHeliaHTTP({
        blockstore,
        datastore,
        blockBrokers: [trustlessGateway()],
        routers: [
          delegatedHTTPRouting(DELEGATED_ROUTING_URL),
          httpGatewayRouting({ gateways: TRUSTLESS_GATEWAYS }),
        ],
      });

      const verifiedFetch = await createVerifiedFetch(helia);
      return { verifiedFetch, helia, disabled: false };
    } catch (err) {
      console.warn('[IPFS] Helia init failed, gateway-only mode:', err?.message || err);
      return { disabled: true };
    }
  })();

  return heliaPromise;
}
