import { createHash, generateKeyPairSync, sign } from 'node:crypto';

export const SIGNED_CLAIMER = `0x${'aB12'.repeat(10)}`;
export const SIGNED_FROM_EMAIL = 'Member@example.test';
export const SIGNED_SELECTOR = 'simulation';

// Keys exist only in this test process. No credentials, DNS or outbound mail are used.
export function createSyntheticDkimKey() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const modulus = BigInt(`0x${Buffer.from(publicKey.export({ format: 'jwk' }).n, 'base64url').toString('hex')}`);
  return { privateKey, publicKey, modulus, txt: `v=DKIM1; k=rsa; p=${der.toString('base64')}` };
}

// Independent RFC 6376 relaxed canonicalization, used only to sign the synthetic mail.
// Do not import the verifier's own canonicalizer: that would hide shared mistakes.
function relaxedHeader(line) {
  const colon = line.indexOf(':');
  const name = line.slice(0, colon).toLowerCase().trim();
  const value = line.slice(colon + 1).replace(/\r\n[ \t]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/^ | $/g, '');
  return `${name}:${value}`;
}

function relaxedBody(body) {
  const lines = body.toString('latin1').replace(/\r?\n/g, '\r\n').split('\r\n')
    .map(line => line.replace(/[ \t]+/g, ' ').replace(/ $/, ''));
  while (lines.length && lines.at(-1) === '') lines.pop();
  return Buffer.from(lines.length ? `${lines.join('\r\n')}\r\n` : '', 'latin1');
}

/** RSA2048 signed example.test fixture. Options are synthetic bytes, never real email. */
export function signSyntheticEmail(key, {
  claimer = SIGNED_CLAIMER,
  from = `Member <${SIGNED_FROM_EMAIL}>`,
  subject = `Claim POP role for ${claimer}`,
  dkimDomain = 'example.test',
  body = Buffer.from('Synthetic signed claim mail.\r\n'),
  extraHeaders = [],
  unsignedHeaders = [],
  signedHeaderNames,
  foldDkim = false,
} = {}) {
  const bodyBytes = Buffer.from(body);
  const canonicalBody = relaxedBody(bodyBytes);
  const bodyHash = createHash('sha256').update(canonicalBody).digest('base64');
  const headers = [
    `From: ${from}`, 'To: claim@example.test', `Subject: ${subject}`,
    'Date: Sat, 17 Oct 2026 12:00:00 +0000',
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=iso-8859-1',
    'Content-Transfer-Encoding: 8bit', ...extraHeaders,
  ];
  const names = signedHeaderNames || headers.map(line => line.slice(0, line.indexOf(':')).toLowerCase());
  const signedLines = names.map(name => {
    const line = [...headers].reverse().find(header => header.slice(0, header.indexOf(':')).toLowerCase() === name);
    if (!line) throw new Error(`Missing synthetic signed header ${name}`);
    return relaxedHeader(line);
  });
  let dkim = `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=${dkimDomain}; s=${SIGNED_SELECTOR}; h=${names.join(':')}; bh=${bodyHash}; b=`;
  if (foldDkim) dkim = dkim.replace(/; /g, ';\r\n\t');
  const canonicalHeaders = Buffer.from(`${signedLines.join('\r\n')}\r\n${relaxedHeader(dkim)}`, 'latin1');
  const signature = sign('RSA-SHA256', canonicalHeaders, key.privateKey);
  const encodedSignature = signature.toString('base64');
  dkim += foldDkim ? encodedSignature.match(/.{1,64}/g).join('\r\n\t') : encodedSignature;
  return {
    raw: Buffer.concat([Buffer.from([...headers, ...unsignedHeaders, dkim].join('\r\n') + '\r\n\r\n', 'latin1'), bodyBytes]),
    canonicalHeaders, canonicalBody, bodyHash,
    signature: BigInt(`0x${signature.toString('hex')}`),
    publicKey: key.modulus, selector: SIGNED_SELECTOR, dkimDomain,
    dnsName: `${SIGNED_SELECTOR}._domainkey.${dkimDomain}`,
    txt: key.txt, claimer,
  };
}

/** Only the installed verifier's two DoH endpoints may fetch, for exact synthetic TXT names. */
export function createSyntheticDkimDns(records) {
  const calls = [];
  const unexpected = [];
  return {
    calls, unexpected,
    async fetch(input, init) {
      const url = new URL(String(input));
      const name = url.searchParams.get('name');
      const endpoint = `${url.origin}${url.pathname}`;
      if (!['https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query'].includes(endpoint)
          || url.searchParams.get('type') !== '16' || !records.has(name)
          || (init?.method && init.method !== 'GET')) {
        unexpected.push({ endpoint, name });
        throw new Error('Unexpected network forbidden in signed DKIM simulation');
      }
      calls.push({ endpoint, name, type: 16 });
      // Quoted, segmented TXT is the actual DoH representation (no space inside base64).
      const txt = records.get(name);
      const data = `"${txt.slice(0, 180)}""${txt.slice(180)}"`;
      return new Response(JSON.stringify({
        Status: 0, Answer: [{ name, type: 16, TTL: 300, data }],
      }), { status: 200, headers: { 'Content-Type': 'application/dns-json' } });
    },
  };
}

export function replaceSignedMailBytes(raw, before, after) {
  const value = raw.toString('latin1');
  if (!value.includes(before)) throw new Error('Synthetic byte mutation target not found');
  return Buffer.from(value.replace(before, after), 'latin1');
}
