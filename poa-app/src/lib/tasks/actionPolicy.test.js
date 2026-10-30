import { describe, expect, it } from 'vitest';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import { taskActionPolicy, projectHasReviewCapability } from '@/lib/tasks/actionPolicy';
import { releasePresentation } from '@/lib/tasks/releasePresentation';

const TM = `0x${'12'.repeat(20)}`;
const PID = `0x${'01'.repeat(32)}`;
const ACCOUNT = `0x${'34'.repeat(20)}`;
const OTHER = `0x${'56'.repeat(20)}`;
const scope = { chainId: 100, orgId: `0x${'ab'.repeat(32)}`, contract: TM,
  endpoint: 'https://example.test/gnosis', account: ACCOUNT, hydrated: true };
const source = { ...scope, indexed: true, snapshot: 'latest', method: 'board-test', observedAt: 2000 };
const coverage = { status: 'complete', receivedKeys: ['task'], missingIds: [], failedIds: [], issues: [] };
const project = { id: `${TM}-${PID}`, taskSource: source, taskCoverage: coverage, managerFact: knownFact(false) };
const task = { id: `${TM}-9007199254740993`, projectId: project.id, status: 'Assigned', claimedBy: OTHER,
  absoluteDeadline: null, claimDeadline: '1900', requiresApplication: false, applicants: [] };
function options(extra = {}) { return { scope, project, task,
  authority: { scope, projectId: PID, executor: knownFact(false), creator: knownFact(false), permissionMask: knownFact('255') },
  now: 2000000, releasesSupported: true, ...extra }; }

describe('actual board facts into core task policy', () => {
  it('allows exact claim/assignment on expired tasks and keeps the release clock buffer', () => {
    expect(taskActionPolicy(options()).claim.state).toBe('allowed');
    expect(taskActionPolicy(options({ now: 1920000 })).release.state).toBe('denied');
    const decision = taskActionPolicy(options()).release;
    expect(releasePresentation(decision, task, ACCOUNT, true)).toMatchObject({ allowed: true, isClaimer: false });
  });
  it('permits a revoked-role claimer to release and submit without inventing a permission mask', () => {
    const mine = { ...task, claimedBy: ACCOUNT, claimDeadline: null };
    const authority = { scope, projectId: PID, permissionMask: knownFact('0'), executor: knownFact(false), creator: knownFact(false) };
    const actions = taskActionPolicy(options({ task: mine, authority }));
    expect(actions.release.state).toBe('allowed');
    expect(actions.submit.state).toBe('allowed');
    expect(actions.claim.state).toBe('denied');
  });
  it('keeps BUDGET separate from a manager bypass and exact self-review restrictions', () => {
    const authority = { scope, projectId: PID, permissionMask: knownFact('4'), executor: knownFact(false), creator: knownFact(false) };
    const mine = { ...task, status: 'Submitted', claimedBy: ACCOUNT };
    expect(taskActionPolicy(options({ task: mine, authority })).complete.state).toBe('denied');
    const managerActions = taskActionPolicy(options({ task: mine, authority, project: { ...project, managerFact: knownFact(true) } }));
    expect(managerActions.complete.state).toBe('allowed');
    expect(managerActions.budget.state).toBe('denied');
  });
  it('requires current authority at the exact project/account/chain and honors unresolved hydration', () => {
    for (const extra of [
      { scope: { ...scope, hydrated: false } },
      { authority: { ...options().authority, scope: { ...scope, account: OTHER } } },
      { authority: { ...options().authority, projectId: `0x${'02'.repeat(32)}` } },
      { scope: { ...scope, chainId: 42161 } },
    ]) expect(taskActionPolicy(options(extra)).claim.state).toBe('unknown');
  });
  it('keeps unknown deadlines/application state and partial sources unavailable', () => {
    expect(taskActionPolicy(options({ task: { ...task, claimDeadline: undefined } })).claim.state).toBe('unknown');
    expect(taskActionPolicy(options({ task: { ...task, requiresApplication: undefined } })).claim.state).toBe('unknown');
    const incomplete = { ...project, taskCoverage: { ...coverage, status: 'incomplete' } };
    expect(taskActionPolicy(options({ project: incomplete })).submit.state).toBe('unknown');
    expect(taskActionPolicy(options({ project: { ...project, managerFact: unknownFact('unavailable') }, authority: undefined })).claim.state).toBe('unknown');
  });
  it('keeps pending cards and unsupported release indexing vetoed even for managers', () => {
    const manager = { ...project, managerFact: knownFact(true) };
    expect(taskActionPolicy(options({ project: manager, task: { ...task, isIndexing: true } })).complete.state).toBe('unknown');
    expect(taskActionPolicy(options({ releasesSupported: false })).release.state).toBe('denied');
  });
  it('does not treat a capped application preview as proof that the member has never applied', () => {
    const applying = { ...task, status: 'Open', requiresApplication: true, applicationsComplete: false };
    expect(taskActionPolicy(options({ task: applying })).apply.state).toBe('unknown');
    expect(taskActionPolicy(options({ task: { ...applying, applicationsComplete: true } })).apply.state).toBe('unknown');
    expect(taskActionPolicy(options({ task: { ...applying, applicants: [{ address: ACCOUNT }] } })).apply.state).toBe('unknown');
  });
  it('retains review-aware empty views even when no task is currently submitted', () => {
    const authority = options().authority;
    expect(projectHasReviewCapability({ scope, project, authority })).toBe(true);
    expect(projectHasReviewCapability({ scope: { ...scope, account: OTHER }, project, authority })).toBe(false);
    expect(projectHasReviewCapability({ scope, project, authority: { ...authority, permissionMask: knownFact('0') } })).toBe(false);
  });
});
