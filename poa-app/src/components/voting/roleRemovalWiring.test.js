/**
 * React is not mounted in this repo's node-only Vitest suite, so protect the production wiring
 * that joins the independently-tested removal helpers to the Create-a-Vote surface.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');
const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8');

const gallery = read('components', 'voting', 'create', 'IntentGallery.js');
const modal = read('components', 'voting', 'CreateVoteModal.js');
const form = read('hooks', 'useProposalForm.js');
const runtime = read('hooks', 'runtime', 'proposalSubmitRuntime.js');
const page = read('components', 'voting', 'VotingPage.js');
const detail = read('components', 'voting', 'PollDetail.jsx');
const actions = read('hooks', 'useVoteActions.js');
const services = read('hooks', 'useWeb3ServicesRuntime.js');
const configurator = read('components', 'voting', 'RoleRemovalConfigurator.jsx');
const membershipsHook = read('hooks', 'accessV2', 'useAuthorityMemberships.js');
const checks = read('lib', 'voting', 'proposalChecks.js');

describe('lazy proposal submission wiring', () => {
  it('loads and invokes the encoder runtime from the mounted form submit handler', () => {
    expect(form).toMatch(/const handleSubmit = useCallback\(async[\s\S]*?const \{ submitProposalRuntime \} = await import\('@\/hooks\/runtime\/proposalSubmitRuntime'\);[\s\S]*?return await submitProposalRuntime\(\{ proposal,/);
    expect(runtime).toContain('export async function submitProposalRuntime(context, ...args)');
    expect(runtime).toContain('return handleSubmit(...args)');
  });
});

describe('role-removal vote production wiring', () => {
  it('exposes the intent only with the access-v2 gate and mounts its configurator', () => {
    expect(gallery).toContain("type: 'removeRoleMembers'");
    expect(gallery).toContain('v2Only: true');
    expect(gallery).toContain('option.v2Only && !accessV2Enabled');
    expect(modal).toContain('<RoleRemovalConfigurator');
    expect(modal).toMatch(/<IntentGallery[\s\S]*?accessV2=\{accessV2Enabled\}[\s\S]*?\/>/);
    expect(checks).toContain('ROLE_REMOVAL_UNAVAILABLE_MESSAGE');
  });

  it('builds one Yes batch, pins the live authority, and routes it through Hybrid', () => {
    expect(runtime).toContain('const built = buildRoleRemovalBatch({');
    expect(runtime).toContain('authority,\n        subjectId: rc.subjectId');
    expect(runtime).toContain('batches = [built.batch, []]');
    expect(runtime).toContain('gasLimit = built.gasLimit');
    expect(page).toContain("proposalData.type === 'removeRoleMembers'");
    expect(page).toContain("membershipAuthorityAddress: authority.enabled ? (authority.address || '') : ''");
  });

  it('runs fresh canRemove checks and preserves the finalization floor across devices', () => {
    expect(page).toContain('await preflightRoleRemovals({');
    expect(page).toContain('The selected role was renamed.');
    expect(page).toContain('recordGasFloor(');
    expect(page).toContain('if (!result?.success) return false;');
    expect(page).toContain('return true;');
    expect(detail).toContain('onFinalize(contractAddress, proposalId, isBinding, poll)');
    expect(actions).toContain('roleRemovalGasFloorFromProposal(proposal)');
  });

  it('binds MembershipAuthority reads to the org chain instead of the account home chain', () => {
    expect(services).toContain('useEthersProvider({ chainId: orgChainId || DEFAULT_CHAIN_ID })');
    expect(services).toContain('createMembershipAuthorityService(factory, txManager, authorityReadFactory)');
  });

  it('reconciles restored rows and exposes a real retry for both live roster queries', () => {
    expect(modal).toContain('liveReconciled: false');
    expect(configurator).toContain('retainBanConfirmation(');
    expect(configurator).toMatch(/!enabled\s*\|\|\s*subjectsLoading/);
    expect(configurator).toContain('roleNameChanged');
    expect(configurator).toContain('refetchSubjects');
    expect(configurator).toContain('refetchMemberships');
    expect(configurator).toContain('onClick={retryLoads}');
  });

  it('never reconciles a draft against a truncated membership page', () => {
    expect(membershipsHook).toContain('fetchAllAuthorityMembershipRows({');
    expect(membershipsHook).toContain('first: AUTHORITY_MEMBERSHIP_PAGE_SIZE');
    expect(membershipsHook).toContain("fetchPolicy: 'no-cache'");
    expect(membershipsHook).toContain('complete: authority.enabled ? complete : false');
    expect(configurator).toContain('complete: membershipsComplete');
    expect(configurator).toContain('|| !membershipsComplete');
  });
});
