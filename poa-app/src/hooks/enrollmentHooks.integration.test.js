import { fakeBrowserLocks } from '@/services/web3/core/submissionTestHelpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_OPERATION_EVENTS } from '@poa-box/core/execute/outcome';
import { mergeVerifiedAllowlist } from '@poa-box/core/email/allowlist';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { savePendingCredential, readPendingEnrollment } from '@/services/web3/passkey/passkeyStorage';
import { createSubmissionJournal } from '@/services/web3/core/submissionJournal';
const f = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], auth: {}, po: {}, create: vi.fn(), onboard: vi.fn(), service: {}, activate: vi.fn(),
  proof: vi.fn(), fetchDoc: vi.fn(), publicClient: {}, bundlerClient: {}, configs: [], notify: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (compute, deps) => {
    const i = f.cursor++; const prev = f.slots[i];
    if (!prev || deps.some((value, n) => value !== prev.deps[n])) f.slots[i] = { deps, value: compute() };
    return f.slots[i].value;
  };
  return { ...actual, useRef: value => { const i = f.cursor++; return f.slots[i] ||= { current: value }; },
    useState: value => { const i = f.cursor++; f.slots[i] ||= { value: typeof value === 'function' ? value() : value };
      return [f.slots[i].value, next => { f.slots[i].value = typeof next === 'function' ? next(f.slots[i].value) : next; }]; },
    useMemo: memo, useCallback: (cb, deps) => memo(() => cb, deps), useEffect: (effect, deps) => memo(() => { f.effects.push(effect); }, deps),
  };
});
vi.mock('@/context/authState', () => ({ useAuth: () => f.auth }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => f.po }));
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({}), useSwitchChain: () => ({ switchChainAsync: vi.fn() }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ safeFetchFromIpfs: f.fetchDoc, bytes32ToIpfsCid: () => 'QmMock' }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Display name' }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3Services: () => ({ zkEmailInvites: f.service }), useTransactionWithNotification: () => ({ executeWithNotification: f.notify }) }));
vi.mock('@/services/web3/utils/chainClients', () => ({ createChainClients: () => ({ publicClient: f.publicClient, bundlerClient: f.bundlerClient }) }));
vi.mock('@/services/web3/domain/PasskeyOnboardingService', () => ({ OnboardingStep: { IDLE: 'idle', ERROR: 'error', SUCCESS: 'success' }, STEP_MESSAGES: {},
  createPasskeyOnboardingService: config => { f.configs.push(config); return { onboard: f.onboard }; } }));
vi.mock('@/services/web3/domain/ZkEmailOnboardingService', () => ({ createZkEmailOnboardingService: config => { f.configs.push(config); return f.service; } }));
vi.mock('@/lib/zkemail/prover', () => ({ parseEml: () => ({ fromEmail: 'member@example.org', fromDomain: 'example.org' }), generateDomainProof: f.proof, generateEmailAddressProof: f.proof }));
vi.mock('@apollo/client', async original => ({ ...await original(), useQuery: () => ({ data: {
  universalAccountRegistries: [{ id: '0x2222222222222222222222222222222222222222' }],
  passkeyAccountFactories: [{ id: '0x3333333333333333333333333333333333333333' }],
  poaManagerContracts: [{ paymasterHubProxy: '0x4444444444444444444444444444444444444444' }],
} }) }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => ({}) }));
import { usePasskeyOnboarding } from '@/hooks/usePasskeyOnboarding';
import { useSolidarityOnboarding } from '@/hooks/useSolidarityOnboarding';
import { useZkEmailInviteSummary } from '@/hooks/useZkEmailInviteSummary';
import { useClaimZkEmailRole } from '@/hooks/useClaimZkEmailRole';
const ACCOUNT = `0x${'11'.repeat(20)}`, REGISTRY = `0x${'22'.repeat(20)}`, FACTORY = `0x${'33'.repeat(20)}`, MODULE = `0x${'44'.repeat(20)}`;
const ORG = `0x${'55'.repeat(32)}`, HASH = `0x${'66'.repeat(32)}`, TX = `0x${'77'.repeat(32)}`;
const source = { chainId: 100, registryAddress: REGISTRY, factoryAddress: FACTORY };
const credential = { accountAddress: ACCOUNT, credentialId: HASH, rawCredentialId: 'public-pointer', publicKeyX: HASH, publicKeyY: HASH,
  salt: '9007199254740993123456789', username: 'member', orgName: 'Display name', orgId: ORG, flow: 'zkemail', credentialChainId: 100,
  registryAddress: REGISTRY, factoryAddress: FACTORY, targetAddress: MODULE, initiator: { account: null, authType: null } };
const render = hook => { f.cursor = 0; const value = hook(); for (const effect of f.effects.splice(0)) effect(); return value; };
const resetHooks = () => { f.slots = []; f.effects = []; f.cursor = 0; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let storage;
function seed(record) {
  window.localStorage.setItem(`poa:submission:v1:100:${ACCOUNT.toLowerCase()}:${ENTRY_POINT_ADDRESS.toLowerCase()}`,
    JSON.stringify({ ...record, accountAddress: ACCOUNT.toLowerCase(), entryPoint: ENTRY_POINT_ADDRESS }));
}
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: fakeBrowserLocks() });
  vi.clearAllMocks(); resetHooks(); f.configs = [];
  const records = new Map(); storage = { get length() { return records.size; }, key: i => [...records.keys()][i], getItem: key => records.get(key) || null, setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ data: { universalAccountRegistries: [{ id: REGISTRY }],
    passkeyAccountFactories: [{ id: FACTORY }], poaManagerContracts: [{ paymasterHubProxy: MODULE }], paymasterHubContracts: [{ solidarityBalance: '1' }] } }) })));
  f.publicClient = { getChainId: vi.fn(async () => 100), getBytecode: vi.fn(async () => '0x1234'), readContract: vi.fn(async () => '0x0000000000000000000000000000000000000000'), getTransactionReceipt: vi.fn() };
  f.bundlerClient = { getUserOperationReceipt: vi.fn(async () => ({ receipt: { transactionHash: TX } })), sendUserOperation: vi.fn() };
  f.auth = { isAuthHydrated: true, isAuthenticated: false, accountAddress: null, authType: null, sessionGeneration: 1,
    activatePasskey: f.activate, publicClient: f.publicClient, bundlerClient: f.bundlerClient };
  f.po = { orgId: ORG, orgChainId: 100, subgraphUrl: 'https://org.test', quickJoinContractAddress: MODULE, zkEmailInvitesAddress: MODULE, zkEmailInvitesEnabled: true };
  f.service = { createPendingCredential: f.create, getPendingSubmission: vi.fn(() => null), getActiveAllowlist: vi.fn(), isEmailRegistered: vi.fn(async () => false), registerAndClaim: vi.fn() };
  f.proof.mockResolvedValue({ proof: {}, meta: {} });
});
afterEach(() => vi.unstubAllGlobals());
describe('actual enrollment hooks with offline host dependencies', () => {
  it('restores email pending state across reload and blocks a fresh credential in either other flow', async () => {
    savePendingCredential(credential);
    expect(render(useClaimZkEmailRole).pendingAccount).toMatchObject({ accountAddress: ACCOUNT, credentialChainId: 100 });
    resetHooks(); expect(render(usePasskeyOnboarding).hasPendingEnrollment).toBe(true);
    resetHooks(); render(useSolidarityOnboarding); await flush();
    expect(render(useSolidarityOnboarding).hasPendingEnrollment).toBe(true);
    expect(f.create).not.toHaveBeenCalled(); expect(f.onboard).not.toHaveBeenCalled();
  });
  it('passes a captured service guard and never activates a solidarity completion from an old session', async () => {
    render(useSolidarityOnboarding); await flush(); const hook = render(useSolidarityOnboarding);
    f.onboard.mockImplementation(async () => { f.auth = { ...f.auth, sessionGeneration: 2 }; render(useSolidarityOnboarding); return { accountAddress: ACCOUNT }; });
    await hook.startOnboarding('member');
    expect(f.configs.at(-1).scopeGuard).toBeTypeOf('function');
    expect(() => f.configs.at(-1).scopeGuard()).toThrow('changed');
    expect(f.activate).not.toHaveBeenCalled(); expect(render(useSolidarityOnboarding).step).toBe('idle');
  });
  it('stops after a late username lookup and does not start an email credential ceremony for a changed source', async () => {
    f.publicClient.readContract.mockImplementation(async () => { f.po = { ...f.po, subgraphUrl: 'https://other.test' }; render(useClaimZkEmailRole); return '0x0000000000000000000000000000000000000000'; });
    const old = render(useClaimZkEmailRole); await old.prepareNewPasskey('member');
    expect(f.create).not.toHaveBeenCalled(); expect(f.activate).not.toHaveBeenCalled();
  });
  it('does not retain a proof or allow a saved Finish callback after account/session generation changes', async () => {
    savePendingCredential(credential);
    const list = mergeVerifiedAllowlist({ orgId: ORG, currentRoot: `0x${'00'.repeat(32)}`, entries: [{ type: 'domain', identifier: 'example.org', hatIds: ['7'] }] });
    f.service.getActiveAllowlist.mockResolvedValue({ root: list.root, cid: HASH }); f.fetchDoc.mockResolvedValue(list.doc);
    f.proof.mockImplementation(async () => { f.auth = { ...f.auth, sessionGeneration: 2 }; render(useClaimZkEmailRole); return { proof: {}, meta: {} }; });
    const old = render(useClaimZkEmailRole);
    await old.claim(`DKIM-Signature: mock\nReceived: mock\nSubject: Claim POP role for ${ACCOUNT}`);
    expect(render(useClaimZkEmailRole).ready).toBe(false);
    await expect(old.finishClaim()).rejects.toThrow('changed');
    expect(f.service.registerAndClaim).not.toHaveBeenCalled(); expect(f.activate).not.toHaveBeenCalled();
  });
  it('reconciles saved canonical success after reload using reads only and preserves the credential source chain', async () => {
    savePendingCredential(credential);
    seed({
      chainId: 100, entryPoint: ENTRY_POINT_ADDRESS, phase: 'submitted', computedHash: HASH, sender: ACCOUNT, nonce: '9007199254740993123',
    });
    f.publicClient.getTransactionReceipt.mockResolvedValue({ transactionHash: TX, status: 'success', logs: [{ address: ENTRY_POINT_ADDRESS,
      ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [HASH, ACCOUNT, `0x${'00'.repeat(20)}`, '9007199254740993123', true, 10, 20]),
    }] });
    resetHooks(); await render(useClaimZkEmailRole).checkPendingEnrollment();
    expect(f.activate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ accountAddress: ACCOUNT, credentialChainId: 100, salt: credential.salt }));
    expect(f.bundlerClient.sendUserOperation).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled(); expect(f.service.registerAndClaim).not.toHaveBeenCalled();
    expect(readPendingEnrollment(source)).toBeNull();
  });
  it('rechecks a saved success marker after journal clearing instead of trusting local confirmation status', async () => {
    const confirmation = { status: 'succeeded', accountAddress: ACCOUNT, sender: ACCOUNT, nonce: '1', chainId: 100,
      transactionHash: TX, entryPoint: ENTRY_POINT_ADDRESS, computedHash: HASH };
    savePendingCredential({ ...credential, confirmation });
    f.publicClient.getTransactionReceipt.mockResolvedValue({ transactionHash: TX, status: 'success', logs: [] });
    await render(useClaimZkEmailRole).checkPendingEnrollment();
    expect(f.activate).not.toHaveBeenCalled();
    expect(render(useClaimZkEmailRole).recoveryStatus).toBe('unknown');
    f.publicClient.getTransactionReceipt.mockResolvedValue({ transactionHash: TX, status: 'success', logs: [{ address: ENTRY_POINT_ADDRESS,
      ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [HASH, ACCOUNT, `0x${'00'.repeat(20)}`, 1, true, 10, 20]),
    }] });
    resetHooks(); await render(useClaimZkEmailRole).checkPendingEnrollment();
    expect(f.activate).toHaveBeenCalledOnce();
    expect(f.bundlerClient.getUserOperationReceipt).not.toHaveBeenCalled();
    expect(f.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  });
  it('keeps public invite summary indexed-first and masks previous source/session details synchronously', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { organization: { id: ORG, zkEmailInvites: {
      id: MODULE, activeRoot: HASH, activeAllowlist: { root: HASH, entries: [{ entryType: 'domain', identifier: 'example.org', hatIds: ['7'] }] },
    } } } }) });
    render(useZkEmailInviteSummary); await flush();
    expect(render(useZkEmailInviteSummary)).toMatchObject({ status: 'active', domains: [{ domain: 'example.org', roleNames: [] }] });
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.variables).toEqual({ orgId: ORG });
    expect(request.query).toContain('FetchZkEmailModule');
    fetch.mockImplementation(() => new Promise(() => {}));
    f.auth = { ...f.auth, sessionGeneration: 2 };
    expect(render(useZkEmailInviteSummary)).toMatchObject({ status: 'loading', domains: [] });
    expect(f.publicClient.readContract).not.toHaveBeenCalled();
    expect(f.fetchDoc).not.toHaveBeenCalled();
  });
  it('does not activate or publish another organization’s saved confirmation', async () => {
    savePendingCredential({ ...credential, confirmation: { status: 'succeeded', accountAddress: ACCOUNT, chainId: 100, transactionHash: TX } });
    f.po = { ...f.po, orgId: `0x${'88'.repeat(32)}` };
    await render(useClaimZkEmailRole).checkPendingEnrollment();
    expect(f.activate).not.toHaveBeenCalled();
    expect(render(useClaimZkEmailRole).step).not.toBe('done');
    expect(readPendingEnrollment(source)).not.toBeNull();
  });
  it.each(['unknown', 'inner-failed', 'outer-reverted', 'different-session', 'legacy-unknown'])('does not activate %s recovery or replay its enrollment', async mode => {
    const saved = { ...credential };
    if (mode === 'different-session') saved.initiator = { account: ACCOUNT, authType: 'eoa' };
    if (mode === 'legacy-unknown') { delete saved.credentialChainId; delete saved.registryAddress; delete saved.factoryAddress; }
    savePendingCredential(saved);
    if (['unknown', 'inner-failed', 'outer-reverted'].includes(mode)) seed({
      chainId: 100, entryPoint: ENTRY_POINT_ADDRESS, phase: 'submitted', computedHash: HASH, sender: ACCOUNT, nonce: '1',
    });
    f.publicClient.getTransactionReceipt.mockResolvedValue({ transactionHash: TX, status: mode === 'outer-reverted' ? 'reverted' : 'success',
      logs: mode === 'inner-failed' ? [{ address: ENTRY_POINT_ADDRESS, ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [HASH, ACCOUNT, `0x${'00'.repeat(20)}`, 1, false, 10, 20]) }] : [] });
    await render(useClaimZkEmailRole).checkPendingEnrollment();
    expect(f.activate).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled(); expect(f.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(readPendingEnrollment(source)).not.toBeNull();
  });
});

describe('explicit legacy restart in the actual email hook', () => {
  it('keeps an unrecoverable setup and requires independently restored identity before restart', async () => {
    savePendingCredential({ ...credential, initiator: null });
    const before = storage.getItem('poa-passkey-pending');
    await render(useClaimZkEmailRole).checkPendingEnrollment();
    expect(f.activate).not.toHaveBeenCalled();
    expect(render(useClaimZkEmailRole).recoveryError.message).toMatch(/could not be verified/);
    await render(useClaimZkEmailRole).restartExistingAccount();
    expect(render(useClaimZkEmailRole).restartReady).toBe(false);
    f.auth = { ...f.auth, isAuthenticated: true, accountAddress: ACCOUNT, authType: 'eoa', sessionGeneration: 2 };
    const restored = render(useClaimZkEmailRole);
    await restored.restartExistingAccount();
    expect(render(useClaimZkEmailRole).restartReady).toBe(true);
    expect(storage.getItem('poa-passkey-pending')).toBe(before);
    expect(storage.getItem('poa-passkey-enrollment-restarts:v1')).toContain('claim-with-existing-account');
    f.auth = { ...f.auth, sessionGeneration: 4 };
    expect(render(useClaimZkEmailRole).restartReady).toBe(false);
    expect(f.activate).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled();
  });
  it('never accepts restart from an obsolete callback or unresolved original send', async () => {
    savePendingCredential(credential);
    f.auth = { ...f.auth, isAuthenticated: true, accountAddress: ACCOUNT, authType: 'eoa' };
    const old = render(useClaimZkEmailRole);
    f.auth = { ...f.auth, sessionGeneration: 3 }; render(useClaimZkEmailRole);
    await expect(old.restartExistingAccount()).rejects.toThrow('changed');
    seed({ chainId: 100, phase: 'submitting', kind: 'transaction', nonce: '7' });
    await render(useClaimZkEmailRole).restartExistingAccount();
    expect(render(useClaimZkEmailRole).restartReady).toBe(false);
    expect(storage.getItem('poa-passkey-enrollment-restarts:v1')).toBeNull();
    expect(f.create).not.toHaveBeenCalled(); expect(f.activate).not.toHaveBeenCalled();
  });
});

it('requires a fresh account-bound email proof and current invite after explicit restart', async () => {
  savePendingCredential({ ...credential, initiator: null });
  const before = storage.getItem('poa-passkey-pending');
  f.auth = { ...f.auth, isAuthenticated: true, accountAddress: ACCOUNT, authType: 'eoa' };
  const list = mergeVerifiedAllowlist({ orgId: ORG, currentRoot: `0x${'00'.repeat(32)}`, entries: [{ type: 'domain', identifier: 'example.org', hatIds: ['7'] }] });
  f.service.getActiveAllowlist.mockResolvedValue({ root: list.root, cid: HASH });
  f.service.claimRoleByDomain = vi.fn(async () => ({ success: true }));
  f.fetchDoc.mockResolvedValue(list.doc);
  f.notify.mockImplementation(async submit => submit());
  const eml = `DKIM-Signature: mock\nReceived: mock\nSubject: Claim POP role for ${ACCOUNT}`;
  await render(useClaimZkEmailRole).claim(eml);
  expect(f.proof).not.toHaveBeenCalled();
  await render(useClaimZkEmailRole).restartExistingAccount();
  await render(useClaimZkEmailRole).claim(eml);
  expect(f.proof).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ claimer: ACCOUNT }));
  expect(render(useClaimZkEmailRole).ready).toBe(true);
  await render(useClaimZkEmailRole).finishClaim();
  expect(f.service.getActiveAllowlist).toHaveBeenCalledTimes(2);
  expect(f.service.claimRoleByDomain).toHaveBeenCalledOnce();
  expect(f.service.registerAndClaim).not.toHaveBeenCalled();
  expect(f.activate).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled();
  expect(storage.getItem('poa-passkey-pending')).toBe(before);
});
