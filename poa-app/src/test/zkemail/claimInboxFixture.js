// Test-only: execute the repository worker, never a replacement fixture server.
// This explicit outside-src import must not be reachable from production modules.
import worker from '../../../../cloudflare-worker-claim-inbox/worker.mjs';

export const CLAIM_INBOX_ADDRESS = `0x${'aB12'.repeat(10)}`;
export const CLAIM_INBOX_ORIGIN = 'https://app.example.test';
export const CLAIM_INBOX_URL = 'https://inbox.example.test';
export const CLAIM_INBOX_TTL_SECONDS = 3600;
export const CLAIM_INBOX_MAX_BYTES = 1_000_000;

/** The JSON eml field is a binary string, NOT Unicode text to UTF-8 encode. */
export function inboxBytesToString(bytes) {
  let raw = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    raw += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return raw;
}

export function inboxStringToBytes(raw) {
  return Uint8Array.from(raw, character => {
    const code = character.charCodeAt(0);
    if (code > 255) throw new Error('Inbox raw mail must contain only byte-valued code units.');
    return code;
  });
}

/** Synthetic DKIM header is only a presence fixture; it cannot verify a signature/proof. */
export function buildClaimInboxEmail({
  claimer = CLAIM_INBOX_ADDRESS,
  subject = `Claim POP role for ${claimer}`,
  from = 'Member <member@example.test>',
  dkim = 'v=1; a=rsa-sha256; d=example.test; s=simulation; b=not-a-real-signature;',
  extraHeaders = [],
  body = 'Synthetic claim inbox simulation.\r\n',
  lineEnding = '\r\n',
} = {}) {
  const headers = [
    'Received: from sender.example.test by inbox.example.test;',
    `From: ${from}`,
    'To: claim@example.test',
    ...(subject === null ? [] : [`Subject: ${subject}`]),
    ...(dkim === null ? [] : [`DKIM-Signature: ${dkim}`]),
    ...extraHeaders,
  ];
  return inboxStringToBytes(`${headers.join(lineEnding)}${lineEnding}${lineEnding}${body}`);
}

/** Minimal KV with an injected clock, actual expirationTtl semantics, and failure injection. */
export function createClaimInboxKv({ nowMs = 0 } = {}) {
  let clock = nowMs;
  const entries = new Map();
  const failures = { get: [], put: [] };
  const calls = { get: [], put: [] };
  return {
    calls,
    advanceMs(ms) {
      if (!Number.isFinite(ms) || ms < 0) throw new Error('Advance by a nonnegative duration.');
      clock += ms;
    },
    failNext(operation, error = new Error('Synthetic KV failure')) {
      if (!failures[operation]) throw new Error('Unsupported KV operation.');
      failures[operation].push(error);
    },
    async put(key, value, options) {
      calls.put.push({ key, value, options });
      if (failures.put.length) throw failures.put.shift();
      entries.set(key, { value, expiresAt: clock + options.expirationTtl * 1000 });
    },
    async get(key) {
      calls.get.push(key);
      if (failures.get.length) throw failures.get.shift();
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= clock) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
  };
}

/** Cloudflare-shaped EmailMessage backed by a real, observable ReadableStream. */
export function createClaimInboxMessage({
  raw = buildClaimInboxEmail(),
  chunkSize = 16384,
  chunks,
  readErrorAtChunk = -1,
  cancelError,
  headers,
} = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) throw new Error('Invalid chunk size.');
  const bytes = typeof raw === 'string' ? inboxStringToBytes(raw) : raw;
  const pieces = chunks || Array.from({ length: Math.ceil(bytes.length / chunkSize) }, (_, index) =>
    bytes.subarray(index * chunkSize, (index + 1) * chunkSize));
  const state = { rejections: [], cancellations: [], pulls: 0, chunksRead: 0, forwards: [], replies: [] };
  const parsedHeaders = headers || new Headers();
  if (!headers) {
    const block = inboxBytesToString(bytes).split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
    for (const line of block.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon > 0) parsedHeaders.append(line.slice(0, colon), line.slice(colon + 1).trim());
    }
  }
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      state.pulls += 1;
      if (index === readErrorAtChunk) {
        controller.error(new Error('Synthetic stream failure'));
      } else if (index === pieces.length) {
        controller.close();
      } else {
        state.chunksRead += 1;
        controller.enqueue(pieces[index++]);
      }
    },
    cancel(reason) {
      state.cancellations.push(reason);
      if (cancelError) throw cancelError;
    },
  }, { highWaterMark: 0 });
  const message = {
    from: 'member@example.test',
    to: 'claim@example.test',
    rawSize: bytes.length,
    headers: parsedHeaders,
    raw: stream,
    setReject(reason) { state.rejections.push(reason); },
    async forward(address) { state.forwards.push(address); throw new Error('Outbound mail forbidden.'); },
    async reply(mail) { state.replies.push(mail); throw new Error('Outbound mail forbidden.'); },
  };
  return { message, state };
}

/**
 * A fresh browser verifier can intercept its inbox URL and call:
 *   await route.fulfill(await fixture.responseFor(route.request().url()));
 * Deliver mail via fixture.deliver() first. No listener, browser hook, network, or production route.
 */
export function createClaimInboxFixture({ allowedOrigin = CLAIM_INBOX_ORIGIN, kv = createClaimInboxKv() } = {}) {
  const env = { CLAIM_EMAILS: kv, ALLOWED_ORIGIN: allowedOrigin };
  const deliveries = [];
  return {
    kv,
    env,
    deliveries,
    async deliver(options) {
      const delivery = createClaimInboxMessage(options);
      deliveries.push(delivery);
      await worker.email(delivery.message, env);
      return delivery;
    },
    async fetch(input = `/claim-email?claimer=${CLAIM_INBOX_ADDRESS}`, init) {
      const request = input instanceof Request ? input : new Request(new URL(input, CLAIM_INBOX_URL), init);
      return worker.fetch(request, env);
    },
    async responseFor(input, init) {
      const response = await this.fetch(input, init);
      return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
    },
  };
}
