import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], auth: {}, po: {}, upload: vi.fn(), emit: vi.fn(), host: vi.fn(), resolve: vi.fn(), onboard: vi.fn(), activate: vi.fn(), wait: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (compute, deps) => {
    const index = fixture.cursor++;
    const previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: compute() };
    return fixture.slots[index].value;
  };
  return { ...actual, useRef: value => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: value }; },
    useState: value => { const index = fixture.cursor++; fixture.slots[index] ||= { value: typeof value === 'function' ? value() : value }; return [fixture.slots[index].value, next => { fixture.slots[index].value = next; }]; },
    useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (effect, deps) => memo(() => { fixture.effects.push(effect); }, deps),
  };
});
vi.mock('@/context/authState', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => fixture.po }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ addToIpfs: fixture.upload }) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshEmit: () => ({ emit: fixture.emit }), RefreshEvent: { PROFILE_UPDATED: 'user:profile_updated' } }));
vi.mock('@/context/WalletContext', () => ({ useConfig: () => ({}), useSwitchChain: () => ({}), getConnectorClient: vi.fn(), clientToSigner: vi.fn() }));
vi.mock('@/util/waitForSubgraph', () => ({ waitForSubgraphBlock: (...args) => fixture.wait(...args) }));
vi.mock('@/services/web3/core/accountWriteSource', () => ({ resolveAccountWriteSource: (...args) => fixture.resolve(...args) }));
vi.mock('@/services/web3/core/accountHost', () => ({ createAccountHost: (...args) => fixture.host(...args) }));

vi.mock('@apollo/client', async original => ({ ...await original(), useQuery: document => ({ data: document.definitions[0].name.value === 'FetchPasskeyFactoryAddress'
  ? { passkeyAccountFactories: [{ id: '0x3333333333333333333333333333333333333333' }] }
  : { universalAccountRegistries: [{ id: '0x2222222222222222222222222222222222222222' }], poaManagerContracts: [{ paymasterHubProxy: '0x4444444444444444444444444444444444444444' }] } }) }));
vi.mock('@/util/apolloClient', () => ({ getClient: vi.fn() }));
vi.mock('@/services/web3/utils/chainClients', () => ({ createChainClients: () => ({ publicClient: fixture.auth.publicClient, bundlerClient: fixture.auth.bundlerClient }) }));
vi.mock('@/services/web3/domain/PasskeyOnboardingService', () => ({
  OnboardingStep: { IDLE: 'idle', ERROR: 'error' }, STEP_MESSAGES: {},
  createPasskeyOnboardingService: () => ({ onboard: (...args) => fixture.onboard(...args) }),
}));
import { usePasskeyOnboarding } from '@/hooks/usePasskeyOnboarding';
import { useProfileUpdate } from '@/hooks/useProfileUpdate';
const account = '0x1111111111111111111111111111111111111111';
const registry = '0x2222222222222222222222222222222222222222';
const cid = 'QmYwAPJzv5CZsnAzt8auVZRnGi2Cjz5mPfYvJuLtLMgHNS';
const source = { account, contract: registry, chainId: 100, endpoint: 'https://org.test', indexed: true, snapshot: 'latest', method: 'graph' };
const ProfileHarness = () => { fixture.cursor = 0; const result = useProfileUpdate(); for (const effect of fixture.effects.splice(0)) effect(); return result; };
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.clearAllMocks(); fixture.slots = []; fixture.cursor = 0; fixture.effects = [];
  fixture.auth = { accountAddress: account, authType: 'passkey', isPasskeyUser: true, isAuthHydrated: true, sessionGeneration: 1 };
  fixture.po = { orgId: 'org-a', orgChainId: 100, subgraphUrl: 'https://org.test', quickJoinContractAddress: '0x5555555555555555555555555555555555555555' };
  fixture.auth.publicClient = { getChainId: vi.fn(async () => 100), getBytecode: vi.fn(async () => '0x1234') };
  fixture.auth.bundlerClient = {}; fixture.auth.activatePasskey = fixture.activate;
  fixture.resolve.mockResolvedValue({ source }); fixture.upload.mockResolvedValue({ path: cid });
  fixture.wait.mockResolvedValue();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('profile hook with real core prepared intent and mocked manager transport', () => {
  it('waits on the profile registration endpoint and discards a late indexer refresh after account navigation', async () => {
    let release;
    fixture.wait.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    fixture.host.mockResolvedValue({ factory: { createWritable: () => ({}) }, manager: { execute: async () => ({ success: true, txHash: 'mock-hash', blockNumber: 42 }) } });
    fixture.po = { ...fixture.po, subgraphUrl: 'https://different-org.test', orgChainId: 42161 };
    expect(await ProfileHarness().updateProfile({ bio: 'edited' })).toBe('mock-hash');
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith(source.endpoint, 42);
    expect(fixture.emit).not.toHaveBeenCalled();
    fixture.auth = { ...fixture.auth, accountAddress: registry, sessionGeneration: 2 }; ProfileHarness();
    release(); await Promise.resolve(); await Promise.resolve();
    expect(fixture.emit).not.toHaveBeenCalled();
  });
  it.each(['eoa', 'passkey'])('preserves %s pending/success lifecycle, one refresh and returned tx hash', async authType => {
    fixture.auth = { ...fixture.auth, authType, isPasskeyUser: authType === 'passkey' };
    fixture.host.mockImplementation(async config => ({ factory: { createWritable: () => ({}) }, manager: { execute: async () => { config.onStateChange('pending'); config.onStateChange('confirming'); return { success: true, txHash: 'mock-hash' }; } } }));
    const hook = ProfileHarness();
    expect(await hook.updateProfile({ bio: 'edited' })).toBe('mock-hash');
    expect(ProfileHarness()).toMatchObject({ isUpdating: false, step: 'success', error: null });
    expect(fixture.emit).toHaveBeenCalledExactlyOnceWith('user:profile_updated', expect.objectContaining({ address: account, chainId: 100, cid, transactionHash: 'mock-hash' }));
    expect(JSON.parse(fixture.upload.mock.calls[0][0]).github).toBe('');
  });
  it.each(['submission_unknown', 'contract_revert'])('retains %s failure and emits no success refresh', async category => {
    fixture.host.mockResolvedValue({ factory: { createWritable: () => ({}) }, manager: { execute: async () => ({ success: false, error: { category, userMessage: 'Check transaction status.' } }) } });
    await expect(ProfileHarness().updateProfile({})).rejects.toThrow('Check transaction status.');
    expect(ProfileHarness().step).toBe('error');
    expect(fixture.emit).not.toHaveBeenCalled();
  });
  it('rejects a saved callback after identity changes before upload', async () => {
    const old = ProfileHarness();
    fixture.auth = { ...fixture.auth, accountAddress: registry, sessionGeneration: 2 }; ProfileHarness();
    await expect(old.updateProfile({})).rejects.toThrow('account or organization changed');
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.host).not.toHaveBeenCalled();
  });
  it('rejects account changes during an awaited upload before constructing a manager or notifying', async () => {
    fixture.upload.mockImplementation(async () => { fixture.auth = { ...fixture.auth, sessionGeneration: 2 }; ProfileHarness(); return { path: cid }; });
    await expect(ProfileHarness().updateProfile({})).rejects.toThrow('account or organization changed');
    expect(fixture.host).not.toHaveBeenCalled(); expect(fixture.emit).not.toHaveBeenCalled();
  });
  it('does not upload or resolve write provenance while authentication is hydrating', async () => {
    fixture.auth.isAuthHydrated = false;
    await expect(ProfileHarness().updateProfile({})).rejects.toThrow('still loading');
    expect(fixture.resolve).not.toHaveBeenCalled(); expect(fixture.upload).not.toHaveBeenCalled();
  });
  it('rejects a resolved null account before resolving provenance or uploading', async () => {
    fixture.auth = { ...fixture.auth, accountAddress: null, isAuthHydrated: true };
    await expect(ProfileHarness().updateProfile({ bio: 'edited' })).rejects.toThrow('still loading');
    expect(fixture.resolve).not.toHaveBeenCalled(); expect(fixture.upload).not.toHaveBeenCalled();
  });
  it('turns an unstructured null transport failure into member-facing copy', async () => {
    fixture.host.mockResolvedValue({ factory: { createWritable: () => ({}) }, manager: { execute: async () => { throw null; } } });
    await expect(ProfileHarness().updateProfile({ bio: 'edited' })).rejects.toThrow('Your profile could not be saved');
    expect(fixture.emit).not.toHaveBeenCalled();
  });

});

const OnboardingHarness = () => { fixture.cursor = 0; const result = usePasskeyOnboarding(); for (const effect of fixture.effects.splice(0)) effect(); return result; };
describe('onboarding hook account scope', () => {
  it('activates only the matching completed scope and records its credential source chain', async () => {
    fixture.onboard.mockResolvedValue({ accountAddress: account, salt: '123', credentialId: 'mock' });
    const result = await OnboardingHarness().startOnboarding('member', '1');
    expect(result.accountAddress).toBe(account);
    expect(fixture.activate).toHaveBeenCalledWith(expect.objectContaining({ accountAddress: account, credentialChainId: 100, salt: '123' }));
  });
  it('suppresses old progress, credential activation and notifications after organization navigation', async () => {
    fixture.onboard.mockImplementation(async (_username, progress) => {
      fixture.po = { ...fixture.po, orgId: 'org-b' }; OnboardingHarness();
      progress('submitting');
      return { accountAddress: account };
    });
    await OnboardingHarness().startOnboarding('member', '1');
    expect(fixture.activate).not.toHaveBeenCalled();
    expect(OnboardingHarness().step).toBe('idle');
  });
  it('fails before creating a credential when target factory code is absent', async () => {
    fixture.auth.publicClient.getBytecode.mockResolvedValue('0x');
    await OnboardingHarness().startOnboarding('member', '1');
    expect(fixture.onboard).not.toHaveBeenCalled();
    expect(fixture.activate).not.toHaveBeenCalled();
    expect(OnboardingHarness().error.message).toMatch(/unavailable/);
  });
});
