import { describe, expect, it } from 'vitest';
import { mergeVerifiedAllowlist, verifyAllowlistDocument } from '@poa-box/core/email/allowlist';
import { buildAllowlist, assertRootMatches, domainHash, emailHash, proofForDomain, proofForEmailHash } from '@/lib/zkemail/allowlist';
import { readInvites } from '@/lib/zkemail/inviteDisplay';

const orgId = `0x${'11'.repeat(32)}`;
describe('authored invitation creation stays canonical and plaintext-first', () => {
  it('retains the asynchronous authored API, normalized identifiers, exact grants and proofs', async () => {
    const pending = buildAllowlist({ orgId, entries: [
      { type: 'email', identifier: ' Person@Example.org ', hatIds: ['9007199254740993123456', '7'] },
      { type: 'domain', identifier: ' Example.org ', hatIds: ['9'] },
    ] });
    expect(pending).toBeInstanceOf(Promise);
    const built = await pending;
    expect(verifyAllowlistDocument(built.doc, { orgId, root: built.root }).root).toBe(built.root);
    const tree = assertRootMatches(built.doc, built.root);
    expect(proofForEmailHash(tree, await emailHash('person@example.org')).hatIds).toEqual(['7', '9007199254740993123456']);
    expect((await proofForDomain(tree, 'example.org')).hatIds).toEqual(['9']);
    expect(await domainHash(' EXAMPLE.org ')).toBe(await domainHash('example.org'));
    expect(built.doc.entries[0].identifier).toBe('person@example.org');
  });

  it('refuses private display rows without actual verified replacement handles', async () => {
    const built = mergeVerifiedAllowlist({ orgId, currentRoot: `0x${'00'.repeat(32)}`, entries: [
      { type: 'email', identifier: 'private@example.org', hatIds: ['7'] },
    ] });
    expect(built.json).not.toContain('private@');
    await expect(buildAllowlist({ orgId, entries: readInvites(built.doc) })).rejects.toThrow();
  });
});
