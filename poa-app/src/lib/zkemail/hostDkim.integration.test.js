import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { domainHash, emailHash } from '@/lib/zkemail/allowlist';
import { generateDomainProof, generateEmailAddressProof } from '@/lib/zkemail/prover';
import { rawEmailString, readRawEmail, normalizeInboxEmail } from '@/lib/zkemail/rawEmail';
import { createClaimInboxFixture } from '@/test/zkemail/claimInboxFixture';
import { createSyntheticDkimKey, signSyntheticEmail, createSyntheticDkimDns, SIGNED_CLAIMER, SIGNED_FROM_EMAIL } from '@/test/zkemail/signedDkimFixture';
import { GROTH16_STUB } from '@/test/zkemail/emailHostFixture';

const f = vi.hoisted(() => ({ load: vi.fn(), prove: vi.fn() }));
vi.mock('@/lib/zkemail/zkeyLoader', () => ({ loadZkey: f.load }));
vi.mock('snarkjs', () => ({ groth16: { fullProve: f.prove } }));
const key = createSyntheticDkimKey();
let dns;
beforeEach(() => {
  vi.clearAllMocks();
  dns = createSyntheticDkimDns(new Map([['simulation._domainkey.example.test', key.txt], ['simulation._domainkey.provider.test', key.txt]]));
  vi.stubGlobal('fetch', dns.fetch);
  f.load.mockResolvedValue({ zkey: 'mocked offline Groth16 key', wasmUrl: 'mocked offline circuit' });
});
afterEach(() => { expect(dns.unexpected).toEqual([]); vi.unstubAllGlobals(); });
const prove = async (emlText, version = 'v2') => {
  const domain = await domainHash('example.test'), email = await emailHash(SIGNED_FROM_EMAIL);
  f.prove.mockResolvedValue({ proof: GROTH16_STUB, publicSignals: version === 'v2'
    ? ['1', '2', BigInt(SIGNED_CLAIMER).toString(), BigInt(email).toString(), BigInt(domain).toString()]
    : ['1', '2', BigInt(SIGNED_CLAIMER).toString(), BigInt(domain).toString()] });
  return (version === 'v2' ? generateEmailAddressProof : generateDomainProof)({ emlText, claimer: SIGNED_CLAIMER });
};

describe('actual host proof preparation with real RSA/DKIM verification and mocked Groth16 only', () => {
  it.each(['v1', 'v2'])('%s selects the verified aligned signer when another DKIM header appears first', async version => {
    const aligned = signSyntheticEmail(key);
    const provider = signSyntheticEmail(key, { dkimDomain: 'provider.test' });
    const providerHeader = provider.raw.toString('latin1').match(/^DKIM-Signature:.*$/m)[0].replace(/\r$/, '');
    const multiSigned = `${providerHeader}\r\n${rawEmailString(aligned.raw)}`;
    const result = await prove(multiSigned, version);
    expect(result.meta.domain).toBe('example.test'); expect(f.prove).toHaveBeenCalledOnce();
    expect(dns.calls.some(call => call.name === 'simulation._domainkey.example.test')).toBe(true);
  });

  for (const version of ['v1', 'v2']) {
    for (const later of [SIGNED_CLAIMER, `0x${'22'.repeat(20)}`]) {
      it.each(['subject', 'X-Original-Subject'])(`${version} binds the first command with ${later === SIGNED_CLAIMER ? 'same' : 'different'} later command in %s`, async location => {
        const first = `Claim POP role for ${SIGNED_CLAIMER}`, repeated = `Claim POP role for ${later}`;
        const signed = signSyntheticEmail(key, location === 'subject'
          ? { subject: `Re: ${first} (was: ${repeated})` }
          : { extraHeaders: [`X-Original-Subject: ${repeated}`] });
        const result = await prove(rawEmailString(signed.raw), version);
        expect(f.load).toHaveBeenCalledOnce(); expect(f.prove).toHaveBeenCalledOnce();
        const inputs = f.prove.mock.calls[0][0];
        expect(inputs.commandIndex).toBe(String(signed.canonicalHeaders.indexOf(first)));
        expect(Number(inputs.commandIndex)).toBeLessThan(signed.canonicalHeaders.lastIndexOf('Claim POP role for 0x'));
        expect(Buffer.from(inputs.emailHeader.map(Number)).subarray(0, signed.canonicalHeaders.length)).toEqual(signed.canonicalHeaders);
        expect(result.meta).toMatchObject({ domain: 'example.test' });
      });
    }
    it.each([`0x${'22'.repeat(20)}`, SIGNED_CLAIMER + 'f', SIGNED_CLAIMER.slice(0, -1) + 'g'])(`${version} rejects first command %s despite a correct later command before artifacts`, async first => {
      const signed = signSyntheticEmail(key, { subject: `Claim POP role for ${first} (was: Claim POP role for ${SIGNED_CLAIMER})` });
      await expect(prove(rawEmailString(signed.raw), version)).rejects.toThrow('claimer mismatch or malformed');
      expect(f.load).not.toHaveBeenCalled(); expect(f.prove).not.toHaveBeenCalled();
      expect(dns.calls).toHaveLength(2); // Actual RSA/DKIM completed before core rejects the binding.
    });
  }

  it('preserves signed non-ASCII bytes through manual upload and both old and new worker conventions', async () => {
    const signed = signSyntheticEmail(key, { extraHeaders: [`X-Note: ${String.fromCharCode(0x80, 0x91, 0x9f, 0xe9, 0xff)}`] });
    const inbox = createClaimInboxFixture();
    await inbox.deliver({ raw: signed.raw });
    const ready = await (await inbox.fetch(`/claim-email?claimer=${SIGNED_CLAIMER}`)).json();
    const mails = [await readRawEmail({ arrayBuffer: async () => Uint8Array.from(signed.raw).buffer }),
      normalizeInboxEmail(ready.eml), normalizeInboxEmail(JSON.parse(JSON.stringify({ eml: new TextDecoder('latin1').decode(signed.raw) })).eml)];
    for (const eml of mails) { await prove(eml); }
    expect(f.prove).toHaveBeenCalledTimes(3);
  });

  it('explains an encoded signed subject without rewriting it or downloading proof artifacts', async () => {
    const subject = `=?UTF-8?B?${Buffer.from(`Claim POP role for ${SIGNED_CLAIMER}`).toString('base64')}?=`;
    const signed = signSyntheticEmail(key, { subject });
    await expect(prove(rawEmailString(signed.raw))).rejects.toThrow('encoded the subject');
    expect(f.load).not.toHaveBeenCalled(); expect(f.prove).not.toHaveBeenCalled();
  });
});
