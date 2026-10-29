import { describe, expect, it } from 'vitest';
import { mergeVerifiedAllowlist, verifyAllowlistDocument } from '@poa-box/core/email/allowlist';
import { replaceInviteRows, verifiedInviteRows, EMPTY_EMAIL_ROOT } from '@/lib/accessV2/roleEmailAllowlist';
import { assertRootMatches, emailHash, proofForEmailHash } from '@poa-box/core/zkemail';
const ORG = `0x${'ab'.repeat(32)}`;
const initial = () => mergeVerifiedAllowlist({ orgId: ORG, currentRoot: EMPTY_EMAIL_ROOT, entries: [
  { type: 'email', identifier: 'first@example.org', hatIds: ['7', '9'] },
  { type: 'email', identifier: 'second@example.org', hatIds: ['8'] },
] });
describe('settings verified source handles through repeated saves', () => {
  it('removes a private invite, changes grants, adds a new address, and refreshes handles for another edit', () => {
    const old = initial();
    const [first] = verifiedInviteRows(old.verified);
    const result = replaceInviteRows({ orgId: ORG, verifiedSource: old.verified, entries: [
      { ...first, hatIds: ['9007199254740993123456', '7'] },
      { type: 'email', identifier: 'third@example.org', hatIds: ['11'] },
    ] });
    const tree = assertRootMatches(result.doc, result.root);
    expect(proofForEmailHash(tree, emailHash('second@example.org'))).toBeNull();
    expect(proofForEmailHash(tree, emailHash('first@example.org')).hatIds).toEqual(['7', '9007199254740993123456']);
    expect(result.json).not.toContain('@');
    const next = verifyAllowlistDocument(result.doc, { orgId: ORG, root: result.root });
    const nextRows = verifiedInviteRows(next);
    const savedAgain = replaceInviteRows({ orgId: ORG, verifiedSource: next, entries: nextRows });
    expect(savedAgain.root).toBe(result.root);
    expect(() => replaceInviteRows({ orgId: ORG, verifiedSource: next, entries: [first] })).toThrow('verified source');
  });
  it('rejects copied or foreign leaf handles, unreadable private rows and wrong-org sources', () => {
    const old = initial(); const [row] = verifiedInviteRows(old.verified);
    expect(() => replaceInviteRows({ orgId: ORG, verifiedSource: old.verified, entries: [{ ...row, leaf: { ...row.leaf } }] })).toThrow('verified source');
    expect(() => replaceInviteRows({ orgId: ORG, entries: [{ ...row, leaf: undefined }] })).toThrow('private');
    expect(() => replaceInviteRows({ orgId: `0x${'cc'.repeat(32)}`, verifiedSource: old.verified, entries: [row] })).toThrow('scope');
  });
});
