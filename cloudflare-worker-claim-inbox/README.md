# POP ZK Email — claim inbox worker

A Cloudflare Email Worker that turns the "send an email, then export the raw `.eml`" step of a ZK
Email role claim into "send an email, click a button." It receives the verification email, stores the
raw DKIM-signed message for ~1 hour, and serves it to the claim page over HTTP so the proof runs
automatically.

## Why this exists (and why it's optional)

Exporting a raw, DKIM-signed `.eml` by hand is a UX minefield: Gmail's "Show original → Download
original" is web-only, Spark and most mobile mail apps can't produce a signed copy at all, and
same-account self-sends / Sent-folder copies are unsigned. This inbox sidesteps all of it — the
worker receives the *delivered* copy, from any client or provider. It requires a DKIM-Signature
header to be present; actual signature verification remains the browser prover's responsibility.

It is a **convenience, not a trust anchor**:

- **Soundness is unchanged.** The worker only relays bytes. Claims are still gated by the DKIM
  signature + the in-browser ZK proof + on-chain merkle/nullifier checks. A malicious or
  compromised inbox cannot forge a claim, steal a role, or bind an email to the wrong address.
- **It can't gate access.** The claim page always keeps manual `.eml` upload as a permissionless
  fallback, so a down / censoring inbox degrades UX only — never the ability to claim. For maximum
  censorship-resistance, an org self-hosts its own inbox (this worker) on its own domain.
- **Front-running is harmless.** A claim mints to the in-circuit-bound address regardless of who
  submits the transaction.

**Privacy tradeoff:** `/claim-email` is unauthenticated, so anyone who knows a claimer address can
read the sender's email address until the entry expires. Set `ALLOWED_ORIGIN` to your app to reduce
casual scraping; use the manual path if that mapping must stay private.

## Deploy

Requires a domain on Cloudflare with **Email Routing** enabled.

```sh
cd cloudflare-worker-claim-inbox
npm i -g wrangler   # if needed

# 1. Create the KV namespace and paste its id into wrangler.toml (id + a preview_id).
wrangler kv namespace create CLAIM_EMAILS

# 2. Deploy the worker.
wrangler deploy
```

Then in the Cloudflare dashboard: **Email → Email Routing → Routes** → add a custom address (e.g.
`claim@yourdomain.com`) and set its action to **Send to a Worker → poa-zkemail-claim-inbox**.

## Wire it to the frontend

Set these before building the app (they gate the auto-fetch UI; unset = manual upload only):

```sh
NEXT_PUBLIC_ZKEMAIL_INBOX=claim@yourdomain.com          # the address users send to
NEXT_PUBLIC_ZKEMAIL_INBOX_URL=https://poa-zkemail-claim-inbox.<your-subdomain>.workers.dev
```

The claim page will pre-fill the "to:" with `NEXT_PUBLIC_ZKEMAIL_INBOX` and poll
`${NEXT_PUBLIC_ZKEMAIL_INBOX_URL}/claim-email?claimer=0x…`.

## HTTP API

| Route | Method | Response |
|---|---|---|
| `/claim-email?claimer=0x…` | GET | `200 {status:"ready",eml}` once received, else `404 {status:"pending"}` |
| `/health` | GET | `200 {ok:true}` |
| Any route | OPTIONS | Empty `200` with the configured CORS headers |

Invalid claimer addresses return `400`. A KV read failure returns retryable `503` JSON. Unsupported
methods on known routes return `405` with `Allow: GET, OPTIONS`; unknown routes return `404` JSON.
CORS echoes only an allowed origin (or `*` when configured), including on error responses. CORS
is not authentication. Mail is latest-wins per case-insensitive claimer address, with a fresh
one-hour expiration after each successful delivery. Mail larger than 1,000,000 bytes is rejected.

### Raw-byte contract

`eml` is a **binary string**: every JavaScript code unit is the original byte value `0..255`,
including control bytes and bytes `0x80..0x9f`. JSON serialization and `Response.json()` preserve
those code units. Reconstruct bytes before passing the message to a DKIM verifier:

```js
const bytes = Uint8Array.from(data.eml, character => character.charCodeAt(0));
```

Do not UTF-8-encode `eml`, use `File.text()` for arbitrary raw mail, or use
`TextDecoder('latin1')`: WHATWG's decoder maps Windows-1252, changing 27 byte values. A manual
file should be read with `arrayBuffer()` to preserve its bytes as well. Decoding RFC 2047 subjects
is only for inbox routing; it never rewrites the stored message or verifies its signature.
Routing success alone does not establish circuit compatibility: the current core input-hint
builder requires the literal claim command in the signed header. A wholly RFC 2047 encoded
command can therefore reach ready status here while still being rejected during proof preparation.

Existing deployed workers may still use the old Windows-1252 conversion. The frontend's
`normalizeInboxEmail()` accepts both that response (inverting the Windows-1252 mapping) and this
source's binary string, preserving the original signed bytes in either case. Offline tests cover
all 256 byte values, and controlled browser tests verify signed non-ASCII mail from both response
formats through real DKIM verification and circuit input generation. Worker redeployment is not
required for this byte-handling fix. The local worker changes have not been deployed; these tests
do not establish real Email Routing delivery or deployed Groth16/claim acceptance.

## Test locally

```sh
wrangler dev
# Simulate a delivered email (must contain a DKIM-Signature header + the claim subject):
curl "http://localhost:8787/health"
```
`wrangler dev` covers the `fetch` (serving) half; real delivery needs an Email Routing route. Both
repository handlers can also be exercised **offline**, without sending mail or deploying:

```sh
cd ../poa-app
# Use the repository's pinned Node 22.23.2 and existing Yarn.
yarn test src/lib/zkemail/claimInbox.worker.test.js
```

The reusable test-only `src/test/zkemail/claimInboxFixture.js` invokes the actual `worker.email`
and `worker.fetch` with an in-memory expiring KV and ReadableStream-backed synthetic EmailMessage.
Its `createClaimInboxFixture()` exposes `deliver()`, `fetch()`, and `responseFor()`. A Node-based
browser verifier can intercept the inbox URL and fulfill it with actual handler responses:

```js
await route.fulfill(await fixture.responseFor(route.request().url()));
```

Before `fixture.deliver()` the poll returns pending `404`; after delivery it returns ready `200`.
`fixture.kv.advanceMs(3_600_000)` expires the entry deterministically, and `failNext('get'|'put')`
injects a storage failure. Import this helper only from test/verification code, never production
routes. Fixtures use `example.test` mailboxes and a deliberately fake DKIM header. They test byte
transport and handler behavior, not cryptographic DKIM or Groth16 verification, Cloudflare KV
replication, or real Email Routing delivery.
