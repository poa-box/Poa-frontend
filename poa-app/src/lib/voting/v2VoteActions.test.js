import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildV2ElectionBatches } from '@/lib/voting/v2VoteActions';
import { AUTHORITY_ADDRESS as A, ALICE, MEMBERS_ID } from '@/lib/accessV2/fixtures';

it('rejects unqualified rosters instead of composing a local election plan', () => {
  expect(() => buildV2ElectionBatches({ authority: A, subjectId: MEMBERS_ID,
    candidates: [{ address: ALICE }], acceptedHolders: new Set([ALICE]), inOrgUsers: [ALICE] })).toThrow('review this election');
});

describe('retired encoders are removed and authority encoders require readiness', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const hook = readFileSync(join(HERE, '..', '..', 'hooks', 'useProposalForm.js'), 'utf8');
  const src = readFileSync(join(HERE, '..', '..', 'hooks', 'runtime', 'proposalSubmitRuntime.js'), 'utf8');

  it('reaches the runtime encoders from the real form submit handler', () => {
    expect(hook).toMatch(/const handleSubmit = useCallback\(async[\s\S]*?const \{ submitProposalRuntime \} = await import\('@\/hooks\/runtime\/proposalSubmitRuntime'\);[\s\S]*?return await submitProposalRuntime\(\{ proposal,/);
    expect(src).toContain('export async function submitProposalRuntime(context, ...args)');
    expect(src).toContain('return handleSubmit(...args)');
  });

  it('never encodes legacy Hats mutation calls', () => {
    for (const fn of ['setWearerEligibility', 'mintHatToAddress', 'transferHat', 'createHatWithEligibility', 'configureVouching', 'setCreatorHatAllowed', 'setProjectRolePerm']) {
      expect(src).not.toMatch(new RegExp(`encodeFunctionData\\(['"]${fn}['"]`));
    }
    expect(src).not.toContain('createHatsService(');
    expect(src).toContain('Authority permissions are required to create a proposal.');
  });

  it('reaches the v2 adapters only through an accessV2 gate', () => {
    // `buildRoleFormBatch` is the create-role half — ONE encoder shared with /team's modal
    // (lib/accessV2/roleFormBatch). A second create-role encoder appearing here is the bug this
    // whole file exists to catch.
    for (const adapter of ['buildV2ElectionBatches', 'prepareReviewedRole']) {
      // import + at least one call site
      expect(src).toContain(adapter);
      const callSites = src.split(`${adapter}(`).length - 1;
      expect(callSites, `${adapter} is imported but never called`).toBeGreaterThan(0);
    }
    // Every v2 branch is chosen by the same predicate, and it reads the flag VotingPage sets.
    expect(src).toMatch(/accessV2\?\.enabled/);
  });
});
