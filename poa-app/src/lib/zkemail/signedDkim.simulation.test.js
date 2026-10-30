import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { verifyDKIMSignature } from '@zk-email/helpers/dist/dkim/index.js';
import { generateEmailVerifierInputsFromDKIMResult } from '@zk-email/helpers/dist/input-generators.js';
import {
  EMAIL_CIRCUIT_RECIPES, buildCircuitInputHints, projectGroth16Proof, requireEmailProofProjection,
} from '@poa-box/core/email/proof';
import { domainHash, emailHash } from '@poa-box/core/zkemail';
import { generateDomainProof, generateEmailAddressProof, parseEml } from '@/lib/zkemail/prover';
import { rawEmailBytes, rawEmailString, readRawEmail } from '@/lib/zkemail/rawEmail';
import { createClaimInboxFixture } from '@/test/zkemail/claimInboxFixture';
import {
  SIGNED_CLAIMER, SIGNED_FROM_EMAIL, createSyntheticDkimKey, signSyntheticEmail,
  createSyntheticDkimDns, replaceSignedMailBytes,
} from '@/test/zkemail/signedDkimFixture';

const key = createSyntheticDkimKey();
const wrongKey = createSyntheticDkimKey();
const signed = signSyntheticEmail(key);
let records;
let dns;
beforeEach(() => {
  records = new Map([[signed.dnsName, key.txt], ['simulation._domainkey.provider.net', key.txt]]);
  dns = createSyntheticDkimDns(records);
  vi.stubGlobal('fetch', dns.fetch);
});
afterEach(() => {
  expect(dns.unexpected).toEqual([]);
  vi.unstubAllGlobals();
});

function inputsAndHints(verified, raw, version, claimer = SIGNED_CLAIMER) {
  const inputs = generateEmailVerifierInputsFromDKIMResult(verified, {
    ignoreBodyHashCheck: true, maxHeadersLength: EMAIL_CIRCUIT_RECIPES[version].maxHeadersLength,
  });
  const parsed = parseEml(rawEmailString(raw));
  const hints = buildCircuitInputHints({
    version, emailHeader: inputs.emailHeader, signedHeaderLength: verified.headers.length,
    fromEmail: parsed.fromEmail, dkimDomain: verified.signingDomain, claimer,
  });
  return { inputs, hints };
}

describe('real installed DKIM RSA verification with synthetic DNS only', () => {
  it('verifies the exact independent RSA2048 signature, signed headers and body via both DoH providers', async () => {
    const verified = await verifyDKIMSignature(signed.raw);
    expect(verified).toMatchObject({
      signature: signed.signature, publicKey: signed.publicKey,
      signingDomain: 'example.test', selector: 'simulation', algo: 'rsa-sha256',
      format: 'relaxed/relaxed', modulusLength: 2048, appliedSanitization: undefined,
      bodyHash: signed.bodyHash,
    });
    expect(Buffer.from(verified.headers)).toEqual(signed.canonicalHeaders);
    expect(Buffer.from(verified.body)).toEqual(signed.canonicalBody);
    expect(createHash('sha256').update(verified.body).digest('base64')).toBe(signed.bodyHash);
    expect(dns.calls).toEqual([
      { endpoint: 'https://dns.google/resolve', name: signed.dnsName, type: 16 },
      { endpoint: 'https://cloudflare-dns.com/dns-query', name: signed.dnsName, type: 16 },
    ]);
  });

  it.each([
    ['signature', raw => replaceSignedMailBytes(raw, 'b=', 'b=A'), /bad signature/],
    ['From address', raw => replaceSignedMailBytes(raw, SIGNED_FROM_EMAIL, 'Other@example.test'), /bad signature/],
    ['bound claimer', raw => replaceSignedMailBytes(raw, SIGNED_CLAIMER, `0x${'22'.repeat(20)}`), /bad signature/],
    ['signed subject', raw => replaceSignedMailBytes(raw, 'Claim POP role', 'Claim POP seat'), /bad signature/],
    ['body', raw => replaceSignedMailBytes(raw, 'Synthetic signed claim mail.', 'Altered signed claim mail.'), /body hash did not verify/],
  ])('rejects a changed %s under actual default verifier settings', async (_, mutate, reason) => {
    await expect(verifyDKIMSignature(mutate(signed.raw))).rejects.toThrow(reason);
  });

  it('rejects a missing DKIM header and a different valid RSA public key', async () => {
    const unsigned = Buffer.from(signed.raw.toString('latin1').replace(/^DKIM-Signature:.*\r\n/m, ''), 'latin1');
    await expect(verifyDKIMSignature(unsigned)).rejects.toThrow('DKIM signature not found for domain example.test');
    records.set(signed.dnsName, wrongKey.txt);
    await expect(verifyDKIMSignature(signed.raw)).rejects.toThrow('bad signature');
  });

  it('safely rejects a provider signer different from From; host proof entry points preserve this restriction', async () => {
    const provider = signSyntheticEmail(key, { dkimDomain: 'provider.net' });
    await expect(verifyDKIMSignature(provider.raw)).rejects.toThrow('DKIM signature not found for domain example.test');
    for (const generate of [generateDomainProof, generateEmailAddressProof]) {
      await expect(generate({ emlText: rawEmailString(provider.raw), claimer: SIGNED_CLAIMER }))
        .rejects.toThrow('DKIM signature not found for domain example.test');
    }
  });

  it('canonicalizes folded signed headers, DKIM tags and signature whitespace without changing the signed command', async () => {
    const folded = signSyntheticEmail(key, {
      from: `Member\r\n\t<${SIGNED_FROM_EMAIL}>`,
      subject: `Claim  POP\trole\r\n\tfor ${SIGNED_CLAIMER} \t`,
      body: Buffer.from('Synthetic\t signed  claim mail. \t\r\n\r\n'), foldDkim: true,
    });
    const verified = await verifyDKIMSignature(folded.raw);
    expect(verified.appliedSanitization).toBeUndefined();
    expect(Buffer.from(verified.headers)).toEqual(folded.canonicalHeaders);
    expect(Buffer.from(verified.body).toString()).toBe('Synthetic signed claim mail.\r\n');
    for (const version of ['v1', 'v2']) {
      expect(inputsAndHints(verified, folded.raw, version).hints.commandIndex)
        .toBe(String(folded.canonicalHeaders.indexOf('Claim POP role')));
    }
  });
});

describe('actual DKIM result -> circuit inputs -> pure v1/v2 preparation', () => {
  it.each(['v1', 'v2'])('%s derives bounded hints, hashes, exact SHA padding and RSA limbs from verified signed bytes', async version => {
    const verified = await verifyDKIMSignature(signed.raw);
    const { inputs, hints } = inputsAndHints(verified, signed.raw, version);
    const bytes = Buffer.from(inputs.emailHeader.map(Number));
    const signedLength = signed.canonicalHeaders.length;
    const paddedLength = Math.ceil((signedLength + 9) / 64) * 64;
    expect(inputs.emailHeader).toHaveLength(1024);
    expect(inputs.emailHeaderLength).toBe(String(paddedLength));
    expect(bytes.subarray(0, signedLength)).toEqual(signed.canonicalHeaders);
    expect(bytes[signedLength]).toBe(0x80);
    expect(bytes.readBigUInt64BE(paddedLength - 8)).toBe(BigInt(signedLength * 8));
    expect([...bytes.subarray(paddedLength)].every(byte => byte === 0)).toBe(true);
    const reconstruct = limbs => limbs.reduce((total, value, index) => total + (BigInt(value) << BigInt(index * 121)), 0n);
    expect(inputs.pubkey).toHaveLength(17);
    expect(inputs.signature).toHaveLength(17);
    expect(reconstruct(inputs.pubkey)).toBe(signed.publicKey);
    expect(reconstruct(inputs.signature)).toBe(signed.signature);
    expect(inputs).not.toHaveProperty('emailBody'); // Recipe skips circuit body hashing; real DKIM above checks it.
    expect(hints).toMatchObject({
      commandIndex: String(signed.canonicalHeaders.indexOf('Claim POP role')),
      fromWindowIndex: '0', emailIndexInWindow: String(signed.canonicalHeaders.indexOf(SIGNED_FROM_EMAIL)),
      atIndex: '6', fromEmail: 'member@example.test', fromDomain: 'example.test', dkimDomain: 'example.test',
      emailHash: emailHash('member@example.test'), fromDomainHash: domainHash('example.test'),
    });
  });

  it('also generates real body-checking inputs without claiming they are a verified circuit proof', async () => {
    const verified = await verifyDKIMSignature(signed.raw);
    const inputs = generateEmailVerifierInputsFromDKIMResult(verified, { maxHeadersLength: 1024, maxBodyLength: 512 });
    expect(inputs.emailBody).toHaveLength(512);
    expect(Buffer.from(inputs.emailBody.map(Number)).subarray(0, signed.canonicalBody.length)).toEqual(signed.canonicalBody);
    expect(inputs.bodyHashIndex).toBe(String(signed.canonicalHeaders.indexOf(signed.bodyHash)));
    expect(inputs.precomputedSHA).toHaveLength(32);
  });

  it.each(['v1', 'v2'])('%s rejects a different claimer in core and in the actual host before artifact fetch', async version => {
    const verified = await verifyDKIMSignature(signed.raw);
    const other = `0x${'22'.repeat(20)}`;
    expect(() => inputsAndHints(verified, signed.raw, version, other)).toThrow('claimer mismatch');
    const generate = version === 'v1' ? generateDomainProof : generateEmailAddressProof;
    await expect(generate({ emlText: rawEmailString(signed.raw), claimer: other })).rejects.toThrow('claimer mismatch');
  });

  it.each(['subject', 'from'])('rejects a valid RSA message whose %s field was not signed', async field => {
    const names = ['from', 'to', 'subject', 'date', 'mime-version', 'content-type', 'content-transfer-encoding'].filter(name => name !== field);
    const incomplete = signSyntheticEmail(key, { signedHeaderNames: names });
    const verified = await verifyDKIMSignature(incomplete.raw);
    for (const version of ['v1', 'v2']) {
      expect(() => inputsAndHints(verified, incomplete.raw, version)).toThrow(field === 'subject' ? 'bound claim command' : 'canonical From');
    }
  });

  it('does not treat a claim command appended outside the signed length as a bound command', async () => {
    const noCommand = signSyntheticEmail(key, { subject: 'No signed command' });
    const verified = await verifyDKIMSignature(noCommand.raw);
    const inputs = generateEmailVerifierInputsFromDKIMResult(verified, { ignoreBodyHashCheck: true, maxHeadersLength: 1024 });
    const command = Buffer.from(`Claim POP role for ${SIGNED_CLAIMER}`);
    const appended = inputs.emailHeader.slice();
    appended.splice(verified.headers.length + 10, command.length, ...[...command].map(String));
    for (const version of ['v1', 'v2']) {
      expect(() => buildCircuitInputHints({
        version, emailHeader: appended, signedHeaderLength: verified.headers.length,
        fromEmail: SIGNED_FROM_EMAIL, dkimDomain: verified.signingDomain, claimer: SIGNED_CLAIMER,
      })).toThrow('bound claim command');
    }
  });

  it.each(['B', 'Q'])('reproduces the outside-ownership RFC2047 %s subject gap with real signed mail', async encoding => {
    const command = `Claim POP role for ${SIGNED_CLAIMER}`;
    const encoded = encoding === 'B' ? Buffer.from(command).toString('base64') : command.replace(/ /g, '_');
    const mail = signSyntheticEmail(key, { subject: `=?UTF-8?${encoding}?${encoded}?=` });
    const inbox = createClaimInboxFixture();
    const { state } = await inbox.deliver({ raw: mail.raw });
    expect(state.rejections).toEqual([]);
    const response = await inbox.fetch(`/claim-email?claimer=${SIGNED_CLAIMER}`);
    expect(response.status).toBe(200);
    const { eml } = await response.json();
    const retained = Buffer.from(rawEmailBytes(eml));
    expect(retained).toEqual(mail.raw);
    const verified = await verifyDKIMSignature(retained);
    expect(Buffer.from(verified.headers)).toEqual(mail.canonicalHeaders);
    expect(Buffer.from(verified.headers).includes(Buffer.from(`=?UTF-8?${encoding}?`))).toBe(true);
    for (const version of ['v1', 'v2']) {
      expect(() => inputsAndHints(verified, retained, version)).toThrow('bound claim command');
      const generate = version === 'v1' ? generateDomainProof : generateEmailAddressProof;
      await expect(generate({ emlText: eml, claimer: SIGNED_CLAIMER })).rejects.toThrow('encoded the subject');
    }
    // Decoding/replacing the header would change the authenticated bytes; it is not a safe fix.
  });

  it.each(['v1', 'v2'])('%s projects representation and claimer binding only, without asserting SNARK validity', async version => {
    const verified = await verifyDKIMSignature(signed.raw);
    const { hints } = inputsAndHints(verified, signed.raw, version);
    // Deliberately synthetic coordinates/signals: projectGroth16Proof is a codec, never a verifier.
    const proof = { protocol: 'groth16', curve: 'bn128', pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] };
    const publicSignals = ['1', '2', BigInt(SIGNED_CLAIMER).toString(),
      ...(version === 'v2' ? [BigInt(hints.emailHash).toString()] : []), BigInt(hints.fromDomainHash).toString()];
    const projected = projectGroth16Proof({ version, proof, publicSignals, claimer: SIGNED_CLAIMER });
    expect(projected.proof.pB).toEqual([['0x4', '0x3'], ['0x6', '0x5']]);
    expect(projected.proof.fromDomainHash).toBe(hints.fromDomainHash);
    if (version === 'v2') expect(projected.proof.emailHash).toBe(hints.emailHash);
    else expect(projected.proof).not.toHaveProperty('emailHash');
    expect(() => requireEmailProofProjection(projected, version, SIGNED_CLAIMER)).not.toThrow();
    expect(() => requireEmailProofProjection(projected, version, `0x${'22'.repeat(20)}`)).toThrow('claimer mismatch');
    expect(() => projectGroth16Proof({ version, proof, publicSignals, claimer: `0x${'22'.repeat(20)}` })).toThrow('different claimer');
  });
});

describe('signed non-ASCII octets through actual worker and frontend byte helpers', () => {
  const octets = Buffer.from([0x00, 0x80, 0x91, 0x9f, 0xe9, 0xff, 0xc3, 0xa9, 0xe2, 0x80, 0x99]);
  const headerOctets = octets.subarray(1); // NUL belongs in the body, never in a MIME header.
  const binary = signSyntheticEmail(key, {
    extraHeaders: [`X-Synthetic-Octets: ${headerOctets.toString('latin1')}`],
    body: Buffer.concat([Buffer.from('Synthetic binary body: '), octets, Buffer.from('\r\n')]),
  });

  it.each([1, 31, 16384])('preserves real DKIM verification through worker -> KV -> JSON -> frontend with chunk size %i', async chunkSize => {
    const inbox = createClaimInboxFixture();
    const { state } = await inbox.deliver({ raw: new Uint8Array(binary.raw), chunkSize });
    expect(state.rejections).toEqual([]);
    expect(state.forwards).toEqual([]);
    expect(state.replies).toEqual([]);
    const response = await inbox.fetch(`/claim-email?claimer=${SIGNED_CLAIMER}`);
    expect(response.status).toBe(200);
    const { eml } = await response.json();
    const retained = Buffer.from(rawEmailBytes(eml));
    expect(retained).toEqual(binary.raw);
    const verified = await verifyDKIMSignature(retained);
    expect(Buffer.from(verified.headers)).toEqual(binary.canonicalHeaders);
    expect(Buffer.from(verified.body)).toEqual(binary.canonicalBody);
    for (const version of ['v1', 'v2']) expect(inputsAndHints(verified, retained, version).hints.fromDomain).toBe('example.test');
  });

  it('reads uploaded file arrayBuffer without UTF-8 loss and still verifies its signed bytes', async () => {
    const file = new File([binary.raw], 'synthetic-signed.eml', { type: 'message/rfc822' });
    const raw = await readRawEmail(file);
    expect(Buffer.from(rawEmailBytes(raw))).toEqual(binary.raw);
    expect((await verifyDKIMSignature(Buffer.from(rawEmailBytes(raw)))).publicKey).toBe(binary.publicKey);
    const lossy = await file.text();
    expect(Buffer.from(lossy)).not.toEqual(binary.raw);
    await expect(verifyDKIMSignature(Buffer.from(lossy))).rejects.toThrow('body hash did not verify');
  });

  it('rejects UTF-8 re-encoding, WHATWG latin1 decoding and a changed signed non-ASCII header octet', async () => {
    await expect(verifyDKIMSignature(binary.raw)).resolves.toMatchObject({ publicKey: binary.publicKey });
    const binaryString = rawEmailString(binary.raw);
    // Installed writeToStream(string) uses Buffer.from(input), which changes high-bit octets.
    await expect(verifyDKIMSignature(binaryString)).rejects.toThrow('body hash did not verify');
    const windows1252 = new TextDecoder('latin1').decode(binary.raw);
    expect(windows1252).not.toBe(binaryString);
    expect(() => rawEmailBytes(windows1252)).toThrow('raw email bytes');
    const altered = replaceSignedMailBytes(binary.raw, `X-Synthetic-Octets: ${headerOctets.toString('latin1')}`, `X-Synthetic-Octets: ${Buffer.from([0x81, ...headerOctets.subarray(1)]).toString('latin1')}`);
    await expect(verifyDKIMSignature(altered)).rejects.toThrow('bad signature');
  });
});
