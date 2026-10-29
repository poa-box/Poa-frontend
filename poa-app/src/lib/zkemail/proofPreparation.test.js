import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { generateDomainProof, generateEmailAddressProof, buildCommand } from '@/lib/zkemail/prover';
import { emailProofProjection } from '@/lib/zkemail/proofProjection';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), inputs: vi.fn(), load: vi.fn(), prove: vi.fn() }));
vi.mock('@zk-email/helpers/dist/dkim', () => ({ verifyDKIMSignature: mocks.verify }));
vi.mock('@zk-email/helpers/dist/input-generators', () => ({ generateEmailVerifierInputsFromDKIMResult: mocks.inputs }));
vi.mock('@/lib/zkemail/zkeyLoader', () => ({ loadZkey: mocks.load }));
vi.mock('snarkjs', () => ({ groth16: { fullProve: mocks.prove } }));
const ADDRESS = `0x${'11'.repeat(20)}`;
const header = `from:Alice <Alice@ACME.org>\r\nsubject:${buildCommand(ADDRESS)}\r\ndkim-signature:d=provider.net;`;
const emlText = `From: Alice <Alice@ACME.org>\r\nSubject: ${buildCommand(ADDRESS)}\r\nDKIM-Signature: d=provider.net;\r\n\r\nMocked email`;
const groth = { pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] };
const signals = (version, claimer = ADDRESS) => version === 'v1'
  ? ['1', '2', BigInt(claimer).toString(), '4'] : ['1', '2', BigInt(claimer).toString(), '3', '4'];
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.verify.mockResolvedValue({ headers: new TextEncoder().encode(header) });
  mocks.inputs.mockImplementation(({ headers }) => ({ emailHeader: [...headers, ...new Array(1024 - headers.length).fill(0)].map(String), emailHeaderLength: '192' }));
  mocks.load.mockResolvedValue({ zkey: 'offline key', wasmUrl: 'offline circuit' });
  vi.stubGlobal('fetch', () => { throw new Error('Network forbidden'); });
});
afterEach(() => vi.unstubAllGlobals());

describe('browser proof transport with canonical preparation', () => {
  it.each([['v1', generateDomainProof], ['v2', generateEmailAddressProof]])('%s preserves proof shape, G2 order, From identity and bound projection', async (version, generate) => {
    mocks.prove.mockResolvedValue({ proof: groth, publicSignals: signals(version) });
    const result = await generate({ emlText, claimer: ADDRESS });
    expect(result.proof.pB).toEqual([['0x4', '0x3'], ['0x6', '0x5']]);
    expect(result.meta.domain).toBe('acme.org');
    expect(result.meta.fromEmail).toBe('Alice@ACME.org');
    expect(emailProofProjection(result.proof, version, ADDRESS).proof).toBe(result.proof);
    expect(mocks.inputs).toHaveBeenCalledWith(expect.any(Object), { ignoreBodyHashCheck: true, maxHeadersLength: 1024 });
    const inputs = mocks.prove.mock.calls[0][0];
    expect(inputs.commandIndex).toBe(String(header.indexOf('Claim POP role')));
    expect(inputs.fromWindowIndex).toBe('0');
    expect(inputs.emailIndexInWindow).toBe(String(header.indexOf('Alice@ACME.org')));
    expect(inputs.atIndex).toBe('5');
  });

  it('fails before downloading artifacts when the claim command is outside the signed header', async () => {
    const signed = 'from:Alice <Alice@ACME.org>\r\nsubject:no claim';
    mocks.verify.mockResolvedValue({ headers: new TextEncoder().encode(signed) });
    // A malicious engine/output appends a matching command past the DKIM signed bytes.
    mocks.inputs.mockImplementation(({ headers }) => ({ emailHeader: [...headers, ...new TextEncoder().encode(header)].map(String), emailHeaderLength: '500' }));
    await expect(generateDomainProof({ emlText, claimer: ADDRESS })).rejects.toThrow('bound claim command');
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.prove).not.toHaveBeenCalled();
  });

  it('rejects wrong public-signal binding, malformed signal counts and field overflow', async () => {
    for (const publicSignals of [signals('v1', `0x${'22'.repeat(20)}`), ['1', '2'], ['1', '2', BigInt(ADDRESS).toString(), (2n ** 256n).toString()]]) {
      mocks.prove.mockResolvedValue({ proof: groth, publicSignals });
      await expect(generateDomainProof({ emlText, claimer: ADDRESS })).rejects.toThrow();
    }
  });
});
