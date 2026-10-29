import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UniversalAccountRegistryAbi } from '@poa-box/core/abis/UniversalAccountRegistry';
import { createClaimInboxFixture, buildClaimInboxEmail } from '@/test/zkemail/claimInboxFixture';
import { ethers } from 'ethers';
import { fakeBrowserLocks, recoveryTestStorage, deferredRecoveryTest } from '@/services/web3/core/submissionTestHelpers';
import { createParityHost } from '@/test/parityHost';
import { savePendingCredential, readPendingEnrollment } from '@/services/web3/passkey/passkeyStorage';
import { SmartAccountTransactionManager } from '@/services/web3/core/SmartAccountTransactionManager';
import { ZkEmailInvitesService } from '@/services/web3/domain/ZkEmailInvitesService';
import { getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { resolveTokenLabel } from '@/util/tokenLabel';
import { ACCOUNT, OTHER, MODULE, REGISTRY, FACTORY, ORG, HASH, TX, ZERO, EMAIL_ROLE, DOMAIN_ROLE,
  credential, deliveredMail, invitationFixture, simulatedProofResult, exactOperationReceipt } from '@/test/zkemail/emailHostFixture';

const f = vi.hoisted(() => ({ auth: {}, po: {}, chain: {}, service: null, list: null, client: {}, bundler: {},
  summary: {}, graphUsername: '', proofVersion: 'v2', switchChain: vi.fn(), fetchDoc: vi.fn(), tx: vi.fn(),
  verify: vi.fn(), inputs: vi.fn(), load: vi.fn(), prove: vi.fn(), create: vi.fn(), signRegistration: vi.fn(),
  signOp: vi.fn(), activate: vi.fn(), emit: vi.fn(), join: vi.fn(), query: vi.fn(), push: vi.fn(), addNotification: vi.fn(), updateNotification: vi.fn() }));
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_ZKEMAIL_INBOX = 'claim@example.test';
  process.env.NEXT_PUBLIC_ZKEMAIL_INBOX_URL = 'https://inbox.example.test';
});
vi.mock('@chakra-ui/react', async () => {
  const { parityChakra } = await import('@/test/parityHost');
  const { createElement, forwardRef } = await import('react');
  const chakra = parityChakra();
  chakra.useClipboard = () => ({ hasCopied: false, onCopy() {} });
  // Keep the celebration's actual DOM visibility observable in this layout-free host.
  chakra.Box = forwardRef(function Box({ children, 'aria-hidden': hidden }, ref) {
    return createElement('div', { ref, 'aria-hidden': hidden, 'data-component': 'Box' }, children);
  });
  return chakra;
});
vi.mock('@/context/authState', () => ({ useAuth: () => f.auth }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => f.po }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ optimisticJoin: f.join, graphUsername: f.graphUsername }) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshEmit: () => ({ emit: f.emit }), RefreshEvent: { ROLE_CLAIMED: 'role:claimed' } }));
vi.mock('@/context/WalletContext', () => ({ useWalletUI: () => ({}), useAccount: () => ({ chain: f.chain }),
  useSwitchChain: () => ({ switchChainAsync: f.switchChain }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ safeFetchFromIpfs: f.fetchDoc, bytes32ToIpfsCid: () => 'QmSynthetic' }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test organization' }));
vi.mock('@/hooks/useWeb3Services', async () => ({ useWeb3Services: () => ({ zkEmailInvites: f.service }),
  useTransactionWithNotification: (await import('@/hooks/useTransactionWithNotification')).useTransactionWithNotification }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: f.addNotification, updateNotification: f.updateNotification }) }));
vi.mock('@/util/waitForSubgraph', () => ({ waitForSubgraphBlock: vi.fn(async () => {}) }));
vi.mock('@/services/web3/utils/chainClients', () => ({ createChainClients: () => ({ publicClient: f.client, bundlerClient: f.bundler }) }));
vi.mock('@apollo/client', async original => ({ ...await original(), useQuery: () => ({ data: {
  universalAccountRegistries: [{ id: REGISTRY }], passkeyAccountFactories: [{ id: FACTORY }],
  poaManagerContracts: [{ paymasterHubProxy: MODULE }],
} }) }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => ({ query: f.query }) }));
vi.mock('@/hooks/useZkEmailInviteSummary', async original => ({ ...await original(), useZkEmailInviteSummary: () => f.summary }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: f.push }) }));
vi.mock('@/components/common/WalletActionButton', () => ({ default: () => null }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));
vi.mock('@zk-email/helpers/dist/dkim', () => ({ verifyDKIMSignature: f.verify }));
vi.mock('@zk-email/helpers/dist/input-generators', () => ({ generateEmailVerifierInputsFromDKIMResult: f.inputs }));
vi.mock('@/lib/zkemail/zkeyLoader', () => ({ loadZkey: f.load, prefetchZkey: vi.fn() }));
vi.mock('snarkjs', () => ({ groth16: { fullProve: f.prove } }));
vi.mock('@/services/web3/passkey/passkeyCreate', () => ({ createPasskeyCredential: f.create }));
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signRegistrationChallenge: f.signRegistration, signUserOpWithPasskey: f.signOp }));
import ZkEmailClaimFlow from '@/components/zkEmail/ZkEmailClaimFlow';

let host, storage, fetchMock;
const BLOCK_HASH = `0x${'de'.repeat(32)}`;
const render = () => host.render(<ZkEmailClaimFlow />);
const flush = async () => act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); });
const tick = async ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const text = () => host.container.textContent;
const confetti = () => host.nodes().find(node => node.attributes['aria-hidden'] === 'true');
const fileInput = () => host.nodes().find(node => node.tagName === 'INPUT' && host.props(node)?.hidden);
const pick = async (eml = deliveredMail(), name = 'claim.eml', custom) => {
  const target = { files: [custom || { name, arrayBuffer: async () => Uint8Array.from(eml, c => c.charCodeAt(0)).buffer }], value: name };
  expect(host.nodes().filter(node => node.tagName === 'INPUT').map(node => host.props(node))).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'file' })]));
  await act(() => host.props(fileInput()).onChange({ target }));
  expect(target.value).toBe('');
};
const finish = () => host.button('Finish & claim my role') || host.button('Retry — confirm with your passkey');
const clickFinish = () => host.click(finish());
const source = { chainId: 100, registryAddress: REGISTRY, factoryAddress: FACTORY, orgId: ORG, targetAddress: MODULE, flow: 'zkemail' };

beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks();
  f.join = vi.fn();
  host = createParityHost(); storage = recoveryTestStorage();
  const createElement = document.createElement;
  document.createElement = name => { const node = createElement(name); node.scrollIntoView = vi.fn(); return node; };
  window.localStorage = storage;
  const events = new EventTarget();
  window.addEventListener = events.addEventListener.bind(events);
  window.removeEventListener = events.removeEventListener.bind(events);
  window.dispatchEvent = events.dispatchEvent.bind(events);
  vi.stubGlobal('localStorage', storage); vi.stubGlobal('navigator', { locks: fakeBrowserLocks() });
  f.list = await invitationFixture(); f.proofVersion = 'v2'; f.graphUsername = 'existing_member';
  f.chain = { id: 100 };
  f.client = { getChainId: vi.fn(async () => 100), getBytecode: vi.fn(async () => '0x1234'),
    getBlock: vi.fn(async ({ blockNumber } = {}) => ({ timestamp: 1000n, number: blockNumber ?? 50n, hash: BLOCK_HASH })), getTransactionReceipt: vi.fn(),
    readContract: vi.fn(async ({ functionName }) => {
      if (functionName === 'merkleRoot') return f.list.root;
      if (functionName === 'allowlistCid') return HASH;
      if (functionName === 'isEmailRegistered') return false;
      if (functionName === 'accountRegistry') return REGISTRY;
      if (functionName === 'universalFactory') return FACTORY;
      if (functionName === 'getAddress') return ACCOUNT;
      if (functionName === 'getAddressOfUsername') return ZERO;
      if (functionName === 'nonces' || functionName === 'getNonce') return 1n;
      if (functionName === 'getBudget') return { capPerEpoch: 10n ** 18n, usedInEpoch: 0n, epochLen: 0n, epochStart: 0n };
      throw new Error(`Unexpected synthetic read: ${functionName}`);
    }) };
  f.bundler = { getUserOperationGasPrice: vi.fn(async () => ({ standard: { maxFeePerGas: 2n, maxPriorityFeePerGas: 1n } })),
    estimateUserOperationGas: vi.fn(async () => ({ callGasLimit: 100000n, verificationGasLimit: 100000n, preVerificationGas: 10000n })),
    sendUserOperation: vi.fn(async op => getUserOpHash(op, ENTRY_POINT_ADDRESS, 100)),
    waitForUserOperationReceipt: vi.fn(async ({ hash }) => ({ receipt: exactOperationReceipt(hash) })),
    getUserOperationReceipt: vi.fn(async () => ({ receipt: { transactionHash: TX } })) };
  f.auth = { isAuthHydrated: true, isAuthenticated: true, accountAddress: ACCOUNT, authType: 'eoa', isPasskeyUser: false,
    sessionGeneration: 1, publicClient: f.client, bundlerClient: f.bundler, activatePasskey: f.activate };
  f.po = { orgId: ORG, orgChainId: 100, subgraphUrl: 'https://index.example.test', zkEmailInvitesAddress: MODULE, zkEmailInvitesEnabled: true,
    roleNames: { [EMAIL_ROLE]: 'Steward', [DOMAIN_ROLE]: 'Member' }, tokenLabel: 'Shares' };
  f.summary = { status: 'active', domains: [{ domain: 'example.test', roleNames: ['Member'] }], emailCount: 1, refresh: vi.fn() };
  const readFactory = { createReadOnly: () => ({ merkleRoot: () => f.client.readContract({ functionName: 'merkleRoot' }),
    allowlistCid: async () => HASH, isEmailRegistered: () => f.client.readContract({ functionName: 'isEmailRegistered' }) }) };
  f.service = new ZkEmailInvitesService({ createWritable: (address, abi) => ({ address, abi }) }, { execute: f.tx }, readFactory);
  f.tx.mockReset().mockResolvedValue({ success: true, txHash: TX, blockNumber: 50 });
  f.fetchDoc.mockReset().mockImplementation(async () => f.list.doc);
  f.verify.mockReset().mockImplementation(async bytes => ({ headers: Buffer.from(bytes.subarray(0, bytes.indexOf('\r\n\r\n')).toString('latin1').replace(/^[^:\r\n]+:/gm, name => name.toLowerCase()), 'latin1') }));
  f.inputs.mockReset().mockImplementation(({ headers }) => ({ emailHeader: [...headers, ...new Array(1024 - headers.length).fill(0)].map(String), emailHeaderLength: '256' }));
  f.load.mockReset().mockResolvedValue({ zkey: 'mock key', wasmUrl: 'mock circuit' });
  f.prove.mockReset().mockImplementation(async inputs => simulatedProofResult(inputs, f.list, f.proofVersion));
  f.signRegistration.mockReset().mockResolvedValue({ authenticatorData: '0x', clientDataJSON: '0x', challengeIndex: 0, typeIndex: 0, r: HASH, s: HASH });
  f.signOp.mockReset().mockResolvedValue('0x1234'); f.create.mockReset().mockResolvedValue(credential);
  f.activate.mockReset().mockImplementation(async value => { f.auth = { ...f.auth, ...value, isAuthenticated: true, isPasskeyUser: true, authType: 'passkey', sessionGeneration: 2 }; await render(); });
  f.query.mockReset().mockResolvedValue({ data: { user: { id: `${ORG}-${ACCOUNT}` } } });
  f.switchChain.mockReset().mockImplementation(async ({ chainId }) => ({ id: chainId }));
  fetchMock = vi.fn(async () => ({ ok: false, status: 404 })); vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => { await host.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('mounted email UI → actual claim hook → actual core/prover adapters → actual services', () => {
  it.each(['username', 'callback', 'both'])('ends confetti at the original deadline after a late %s refresh, joining exactly once', async refresh => {
    const lateUsername = refresh !== 'callback';
    if (lateUsername) f.graphUsername = '';
    const originalJoin = f.join;
    await render(); await pick(); await clickFinish();
    expect(confetti()).toBeDefined();
    expect(originalJoin).toHaveBeenCalledExactlyOnceWith({ address: ACCOUNT, hatIds: [EMAIL_ROLE],
      username: lateUsername ? undefined : 'existing_member' });
    await tick(1000);
    if (lateUsername) f.graphUsername = 'indexed_member';
    if (refresh !== 'username') f.join = vi.fn();
    await render();
    if (lateUsername) expect(text()).toContain('indexed_member');
    expect(confetti()).toBeDefined();
    await tick(3499); expect(confetti()).toBeDefined();
    await tick(1); expect(confetti()).toBeUndefined();
    expect(text()).toContain('Welcome to Test organization');
    expect(originalJoin).toHaveBeenCalledOnce();
    if (refresh !== 'username') expect(f.join).not.toHaveBeenCalled();
    expect(f.tx).toHaveBeenCalledOnce();
  });

  it.each(['session', 'account', 'org', 'chain', 'endpoint', 'module'])('clears success celebration without another membership update when %s changes', async kind => {
    await render(); await pick(); await clickFinish();
    expect(confetti()).toBeDefined();
    const originalJoin = f.join;
    await tick(1000);
    changeScope(kind); f.join = vi.fn(); await render();
    expect(text()).not.toContain('Welcome to Test organization');
    expect(confetti()).toBeUndefined();
    await tick(6000);
    expect(originalJoin).toHaveBeenCalledOnce(); expect(f.join).not.toHaveBeenCalled();
    expect(f.tx).toHaveBeenCalledOnce();
  });

  it.each(['eoa', 'passkey'])('prioritizes specific email v2 and requires explicit Finish for a signed-in %s', async mode => {
    f.auth = { ...f.auth, authType: mode, isPasskeyUser: mode === 'passkey' };
    const proof = deferredRecoveryTest(); f.prove.mockReturnValueOnce(proof.promise);
    await render();
    let picking;
    await act(async () => { picking = host.props(fileInput()).onChange({ target: { files: [{ name: 'claim.eml', arrayBuffer: async () => new TextEncoder().encode(deliveredMail()).buffer }], value: '' } }); for (let i = 0; i < 40; i++) await Promise.resolve(); });
    expect(text()).toContain('Computing your proof'); expect(f.tx).not.toHaveBeenCalled();
    await act(async () => { proof.resolve(simulatedProofResult(f.inputs.mock.results[0].value, f.list, 'v2')); await picking; });
    expect(text()).toContain('Email verified'); expect(f.tx).not.toHaveBeenCalled();
    await clickFinish();
    expect(f.tx).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ address: MODULE }), 'claimRoleByEmail',
      expect.arrayContaining([ACCOUNT, [EMAIL_ROLE]]), expect.objectContaining({ paymasterClaimTarget: MODULE, paymasterHatIds: [EMAIL_ROLE] }));
    expect(text()).toContain('Welcome to Test organization'); expect(text()).toContain('Steward');
    expect(text()).toContain('existing_member'); expect(text()).toContain('earn Shares');
    expect(f.join).toHaveBeenCalledExactlyOnceWith({ address: ACCOUNT, hatIds: [EMAIL_ROLE], username: 'existing_member' });
    expect(f.emit).toHaveBeenCalledWith('role:claimed', { indexed: true });
    await host.click(host.button('Go to your profile →'));
    expect(f.push).toHaveBeenCalledWith('/profile/?org=Test%20organization');
  });

  it.each([{ useTokenSymbol: false, symbol: 'pOa', expected: 'Shares' }, { useTokenSymbol: true, symbol: 'pOa', expected: 'pOa' },
    { useTokenSymbol: true, symbol: '', expected: 'Shares' }])('uses the configured ownership label $expected in success', async ({ expected, ...config }) => {
    f.po = { ...f.po, tokenLabel: resolveTokenLabel(config) };
    await render(); await pick(); await clickFinish(); expect(text()).toContain(`earn ${expected}`);
  });

  it('falls back to domain v1 and retains exact core ABI arguments', async () => {
    f.list = await invitationFixture({ email: false }); f.proofVersion = 'v1';
    await render(); await pick(); await clickFinish();
    expect(f.tx.mock.calls[0][1]).toBe('claimRoleByDomain'); expect(f.tx.mock.calls[0][2]).toContainEqual([DOMAIN_ROLE]);
    expect(text()).toContain('@example.test'); expect(text()).toContain('Member');
  });

  it.each(['cancel', 'paymaster'])('retries a known %s failure without recomputing the proof; double click sends once', async mode => {
    const error = mode === 'cancel' ? Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }) : new Error('AA33 paymaster declined');
    f.tx.mockRejectedValueOnce(error);
    await render(); await pick(); await clickFinish();
    expect(finish()).toBeDefined(); expect(f.prove).toHaveBeenCalledOnce();
    const pending = deferredRecoveryTest(); f.tx.mockReturnValueOnce(pending.promise);
    const callback = host.props(finish()).onClick;
    const submitting = act(async () => { const a = callback(); const b = callback(); await Promise.resolve(); pending.resolve({ success: true }); await Promise.all([a, b]); });
    await submitting;
    expect(f.tx).toHaveBeenCalledTimes(2); expect(f.prove).toHaveBeenCalledOnce(); expect(text()).toContain('Welcome');
  });

  it('invalidates an old ready claim before attempting a new invalid file', async () => {
    await render(); await pick(); expect(finish()).toBeDefined();
    // Native input can still dispatch while the old Finish screen is visible.
    await pick('not signed'); expect(finish()).toBeUndefined(); expect(f.tx).not.toHaveBeenCalled();
  });

  it.each(['ineligible', 'missing-dkim', 'wrong-claimer', 'invalid-document', 'unavailable-document', 'proof-error', 'registered-email'])('rejects %s before signing', async kind => {
    let mail = deliveredMail();
    if (kind === 'ineligible') mail = deliveredMail({ sender: 'outsider@elsewhere.test' });
    if (kind === 'missing-dkim') mail = 'from: member@example.test\r\n\r\nNo signature';
    if (kind === 'wrong-claimer') mail = deliveredMail({ claimer: OTHER });
    if (kind === 'invalid-document') f.fetchDoc.mockResolvedValue({ entries: [] });
    if (kind === 'unavailable-document') f.fetchDoc.mockResolvedValue(null);
    if (kind === 'proof-error') f.prove.mockRejectedValue(new Error('Synthetic proof engine failed'));
    if (kind === 'registered-email') f.client.readContract.mockImplementation(async ({ functionName }) => functionName === 'isEmailRegistered' ? true : f.list.root);
    await render(); await pick(mail);
    expect(text()).toContain('That try didn’t go through'); expect(finish()).toBeUndefined(); expect(f.tx).not.toHaveBeenCalled();
    if (kind !== 'proof-error') expect(f.prove).not.toHaveBeenCalled();
  });

  it('refuses a root changed after proof preparation', async () => {
    await render(); await pick(); f.list = { ...f.list, root: HASH }; await clickFinish();
    expect(text()).toContain('email invites changed'); expect(finish()).toBeUndefined(); expect(f.tx).not.toHaveBeenCalled();
  });

  it.each([true, false])('switches a wrong-chain EOA before transport; refused=$0', async refused => {
    f.chain = { id: 42161 }; if (refused) f.switchChain.mockRejectedValue(new Error('Switch declined'));
    await render(); await pick(); await clickFinish();
    expect(f.switchChain).toHaveBeenCalledExactlyOnceWith({ chainId: 100 });
    expect(f.tx).toHaveBeenCalledTimes(refused ? 0 : 1);
  });

  it('uses bounded indexed membership polling through indexing lag', async () => {
    f.query.mockResolvedValueOnce({ data: { user: null } }).mockResolvedValue({ data: { user: { id: `${ORG}-${ACCOUNT}` } } });
    await render(); await pick(); await clickFinish(); expect(text()).toContain('Setting up your profile');
    await tick(3000); expect(text()).toContain('Your profile is ready');
    expect(f.query).toHaveBeenLastCalledWith(expect.objectContaining({ variables: { id: `${ORG}-${ACCOUNT}`.toLowerCase() }, fetchPolicy: 'network-only' }));
  });
});

const changeScope = kind => {
  if (kind === 'session') f.auth = { ...f.auth, sessionGeneration: f.auth.sessionGeneration + 1 };
  if (kind === 'account') f.auth = { ...f.auth, accountAddress: OTHER };
  if (kind === 'org') f.po = { ...f.po, orgId: `0x${'88'.repeat(32)}` };
  if (kind === 'chain') f.po = { ...f.po, orgChainId: 42161 };
  if (kind === 'endpoint') f.po = { ...f.po, subgraphUrl: 'https://other-index.example.test' };
  if (kind === 'module') f.po = { ...f.po, zkEmailInvitesAddress: OTHER };
};

describe('actual inbox/manual lifecycle with mounted hook', () => {
  it('polls 404 pending → delivered ready, then verifies without auto-submitting', async () => {
    const inbox = createClaimInboxFixture();
    fetchMock.mockImplementation((url, options) => inbox.fetch(url, options));
    await render(); await flush(); expect(f.prove).not.toHaveBeenCalled();
    const delivery = await inbox.deliver({ raw: buildClaimInboxEmail({ claimer: ACCOUNT }) });
    expect(delivery.state.rejections).toEqual([]);
    await tick(2000); expect(text()).toContain('Email verified'); expect(f.prove).toHaveBeenCalledOnce();
    expect(f.tx).not.toHaveBeenCalled(); await clickFinish(); expect(text()).toContain('Welcome');
  });

  it.each(['500', '429', 'network', 'json', 'empty', 'wrong-type', 'null'])('survives %s inbox payload and keeps manual fallback usable', async kind => {
    const response = kind === '500' || kind === '429' ? { ok: false, status: Number(kind) }
      : { ok: true, json: async () => {
        if (kind === 'json') throw new SyntaxError('bad JSON');
        return kind === 'null' ? null : { status: 'ready', eml: kind === 'empty' ? '' : { synthetic: true } };
      } };
    if (kind === 'network') fetchMock.mockRejectedValue(new Error('fetch failed')); else fetchMock.mockResolvedValue(response);
    await render(); await tick(4000); expect(f.prove).not.toHaveBeenCalled(); expect(f.tx).not.toHaveBeenCalled();
    await pick(); expect(text()).toContain('Email verified'); await clickFinish(); expect(text()).toContain('Welcome');
  });

  it('bounds a hanging request and the 10-minute window, then Keep watching starts a fresh window', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    await render(); await tick(10_000);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await tick(590_000); expect(text()).toContain('Haven’t seen your email yet');
    expect(f.prove).not.toHaveBeenCalled();
    const count = fetchMock.mock.calls.length;
    await host.click(host.button('Keep watching')); await flush(); expect(fetchMock).toHaveBeenCalledTimes(count + 1);
  });

  it('does not repeatedly prove identical failed mail, accepts new mail, and exposes an explicit retry', async () => {
    let mail = deliveredMail(); fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ status: 'ready', eml: mail }) }));
    f.prove.mockRejectedValueOnce(new Error('Synthetic proof failed'));
    await render(); await flush(); expect(text()).toContain('That try didn’t go through');
    await tick(6000); expect(f.prove).toHaveBeenCalledOnce();
    mail = deliveredMail({ suffix: '-new' });
    await tick(2000); expect(f.prove).toHaveBeenCalledTimes(2); expect(text()).toContain('Email verified');
  });

  it('explicit received-email retry and same manual file selection rerun a failed proof', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'ready', eml: deliveredMail() }) });
    f.prove.mockRejectedValueOnce(new Error('First engine failure'));
    await render(); await flush(); await host.click(host.button('Retry with the received email')); await flush();
    expect(f.prove).toHaveBeenCalledTimes(2); expect(text()).toContain('Email verified');
    await host.click(host.button('Finish & claim my role')); await host.click(host.button('Claim another'));
    fetchMock.mockResolvedValue({ ok: false });
    f.prove.mockRejectedValueOnce(new Error('Second engine failure'));
    await pick(); expect(text()).toContain('That try didn’t go through'); await pick();
    expect(text()).toContain('Email verified'); expect(f.prove).toHaveBeenCalledTimes(4);
  });

  it('manual read wins against an in-flight auto-pickup and reports local file failures', async () => {
    const response = deferredRecoveryTest(), bytes = deferredRecoveryTest();
    fetchMock.mockReturnValueOnce(response.promise);
    await render();
    let picked;
    await act(async () => { picked = host.props(fileInput()).onChange({ target: { value: '', files: [{ name: 'manual.eml', arrayBuffer: () => bytes.promise }] } }); });
    await act(async () => { response.resolve({ ok: true, json: async () => ({ status: 'ready', eml: deliveredMail({ sender: 'outsider@elsewhere.test' }) }) }); });
    await act(async () => { bytes.resolve(new TextEncoder().encode(deliveredMail()).buffer); await picked; });
    expect(f.prove).toHaveBeenCalledOnce(); expect(text()).toContain('Email verified');
  });

  it('handles unreadable files and allows selecting the same file again', async () => {
    await render(); await pick('', 'broken.eml', { name: 'broken.eml', arrayBuffer: async () => { throw new Error('File permission lost'); } });
    expect(text()).toContain('File permission lost'); expect(f.prove).not.toHaveBeenCalled();
    await pick(); expect(text()).toContain('Email verified');
  });

  it.each(['session', 'account', 'org', 'chain', 'endpoint', 'module'])('rejects a late inbox response after %s switch and lets current mail retry', async kind => {
    const old = deferredRecoveryTest(); fetchMock.mockReturnValueOnce(old.promise);
    await render(); changeScope(kind); await render();
    await act(async () => old.resolve({ ok: true, json: async () => ({ status: 'ready', eml: deliveredMail() }) }));
    expect(f.prove).not.toHaveBeenCalled(); expect(f.tx).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: 'ready', eml: deliveredMail({ claimer: f.auth.accountAddress }) }) });
    await tick(2000); expect(f.prove).toHaveBeenCalledOnce(); expect(text()).toContain('Email verified');
  });

  it.each(['session', 'account', 'org', 'chain', 'endpoint', 'module'])('does not keep a completed proof or a saved Finish callback after %s switch', async kind => {
    await render(); await pick(); const callback = host.props(finish()).onClick;
    changeScope(kind); await render(); expect(finish()).toBeUndefined();
    await expect(callback()).rejects.toThrow(/changed/); expect(f.tx).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled();
  });

  it.each(['session', 'account', 'org', 'chain', 'endpoint', 'module'])('drops a late proof result after %s switch', async kind => {
    const proof = deferredRecoveryTest(); f.prove.mockReturnValueOnce(proof.promise);
    await render(); let picked;
    await act(async () => { picked = host.props(fileInput()).onChange({ target: { value: '', files: [{ name: 'late.eml', arrayBuffer: async () => new TextEncoder().encode(deliveredMail()).buffer }] } }); for (let i = 0; i < 40; i++) await Promise.resolve(); });
    const result = simulatedProofResult(f.inputs.mock.results[0].value, f.list, 'v2');
    changeScope(kind); await render();
    await act(async () => { proof.resolve(result); await picked; });
    expect(finish()).toBeUndefined(); expect(f.tx).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled();
  });

  it('drops a late manual file and inbox response after unmount', async () => {
    const bytes = deferredRecoveryTest(), response = deferredRecoveryTest(); fetchMock.mockReturnValueOnce(response.promise);
    await render(); let picked;
    await act(async () => { picked = host.props(fileInput()).onChange({ target: { value: '', files: [{ name: 'late.eml', arrayBuffer: () => bytes.promise }] } }); });
    await host.unmount();
    await act(async () => { response.resolve({ ok: true, json: async () => ({ status: 'ready', eml: deliveredMail() }) }); bytes.resolve(new TextEncoder().encode(deliveredMail()).buffer); await picked; });
    expect(f.prove).not.toHaveBeenCalled(); expect(f.tx).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled();
    host = createParityHost(); // Keep teardown's unmount valid.
  });
});

const asNewAccount = () => {
  f.auth = { ...f.auth, isAuthenticated: false, isPasskeyUser: false, accountAddress: null, authType: null, username: null };
  f.client.getBytecode.mockImplementation(async ({ address }) => address === ACCOUNT ? '0x' : '0x1234');
};
const createAccount = async () => {
  const input = host.nodes().find(node => node.tagName === 'INPUT' && !host.props(node)?.hidden);
  await host.change(input, 'member'); await host.click(host.button('Create passkey & continue'));
};

describe('new-account actual onboarding/journal/core simulation', () => {
  it('creates an isolated pending credential, then activates only after exact confirmed UserOperation', async () => {
    asNewAccount(); await render(); await createAccount();
    expect(readPendingEnrollment(source)?.credential.accountAddress).toBe(ACCOUNT); expect(f.activate).not.toHaveBeenCalled();
    await pick(); expect(f.signRegistration).not.toHaveBeenCalled(); expect(f.bundler.sendUserOperation).not.toHaveBeenCalled();
    await clickFinish();
    expect(f.signRegistration).toHaveBeenCalledOnce(); expect(f.signOp).toHaveBeenCalledOnce(); expect(f.bundler.sendUserOperation).toHaveBeenCalledOnce();
    const sent = f.bundler.sendUserOperation.mock.calls[0][0];
    expect(sent.factory).toBe(FACTORY); expect(sent.sender).toBe(ACCOUNT);
    const accountAbi = new ethers.utils.Interface(['function execute(address target,uint256 value,bytes data)']);
    const inner = accountAbi.decodeFunctionData('execute', sent.callData); expect(inner.target).toBe(MODULE);
    expect(f.activate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ accountAddress: ACCOUNT, username: 'member', credentialChainId: 100 }));
    expect(readPendingEnrollment(source)).toBeNull(); expect(text()).toContain('Welcome'); expect(text()).toContain('member');
    expect(f.join).toHaveBeenCalledExactlyOnceWith({ address: ACCOUNT, hatIds: [EMAIL_ROLE], username: 'member' });
  });

  it('restores only the isolated pending credential and preserves a synthetic legacy record', async () => {
    asNewAccount(); storage.setItem('unrelated:legacy-pointer', 'synthetic-preserved'); savePendingCredential(credential);
    await render(); expect(text()).toContain('Claiming as member'); expect(f.create).not.toHaveBeenCalled();
    await pick(); await clickFinish(); expect(f.activate).toHaveBeenCalledOnce();
    expect(storage.getItem('unrelated:legacy-pointer')).toBe('synthetic-preserved');
  });

  it.each(['missing-logs', 'wrong-sender', 'wrong-nonce', 'wrong-hash', 'inner-failed'])('does not activate a %s receipt', async kind => {
    asNewAccount(); savePendingCredential(credential);
    f.bundler.waitForUserOperationReceipt.mockImplementation(async ({ hash }) => ({ receipt: exactOperationReceipt(kind === 'wrong-hash' ? HASH : hash,
      { logs: kind !== 'missing-logs', sender: kind === 'wrong-sender' ? OTHER : ACCOUNT, nonce: kind === 'wrong-nonce' ? 2n : 1n, success: kind !== 'inner-failed' }) }));
    await render(); await pick(); await clickFinish(); expect(f.activate).not.toHaveBeenCalled(); expect(text()).not.toContain('Welcome');
    expect(readPendingEnrollment(source)).not.toBeNull();
    if (kind !== 'inner-failed') expect(finish()).toBeUndefined();
  });

  it('unknown send blocks retry and reconciles its exact original journal without sending again', async () => {
    asNewAccount(); savePendingCredential(credential);
    f.bundler.sendUserOperation.mockRejectedValueOnce(new Error('network response lost'));
    await render(); await pick(); const oldFinish = host.props(finish()).onClick; await clickFinish();
    expect(finish()).toBeUndefined(); expect(host.button('Check account setup')).toBeDefined(); expect(f.activate).not.toHaveBeenCalled();
    await act(async () => oldFinish()); expect(f.bundler.sendUserOperation).toHaveBeenCalledOnce();
    const key = `poa:submission:v1:100:${ACCOUNT.toLowerCase()}:${ENTRY_POINT_ADDRESS.toLowerCase()}`;
    const saved = JSON.parse(storage.getItem(key)); expect(saved.computedHash).toMatch(/^0x[0-9a-f]{64}$/i);
    f.client.getTransactionReceipt.mockResolvedValue({ ...exactOperationReceipt(saved.computedHash), blockHash: BLOCK_HASH });
    await host.click(host.button('Check account setup')); await flush();
    expect(f.activate).toHaveBeenCalledOnce(); expect(f.bundler.sendUserOperation).toHaveBeenCalledOnce(); expect(text()).toContain('Welcome');
  });

  it.each(['missing', 'orphaned'])('does not activate an uncertain account with %s canonical inclusion evidence', async proof => {
    asNewAccount(); savePendingCredential(credential);
    f.bundler.sendUserOperation.mockRejectedValueOnce(new Error('network response lost'));
    await render(); await pick(); await clickFinish();
    const key = `poa:submission:v1:100:${ACCOUNT.toLowerCase()}:${ENTRY_POINT_ADDRESS.toLowerCase()}`;
    const saved = JSON.parse(storage.getItem(key));
    f.client.getTransactionReceipt.mockResolvedValue({ ...exactOperationReceipt(saved.computedHash),
      ...(proof === 'missing' ? {} : { blockHash: HASH }) });
    await host.click(host.button('Check account setup')); await flush();
    expect(f.activate).not.toHaveBeenCalled(); expect(text()).not.toContain('Welcome');
    expect(JSON.parse(storage.getItem(key))).toEqual(saved);
    expect(host.button('Check account setup')).toBeDefined();
    expect(finish()).toBeUndefined();
    expect(f.bundler.sendUserOperation).toHaveBeenCalledOnce(); expect(f.signOp).toHaveBeenCalledOnce();
  });

  it('keeps the cached proof on definite paymaster refusal and on registration-signature cancellation', async () => {
    asNewAccount(); savePendingCredential(credential);
    f.signRegistration.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
    await render(); await pick(); await clickFinish(); expect(finish()).toBeDefined(); expect(f.bundler.sendUserOperation).not.toHaveBeenCalled();
    f.bundler.sendUserOperation.mockRejectedValueOnce(new Error('AA33 paymaster rejected'));
    await clickFinish(); expect(finish()).toBeDefined(); expect(f.activate).not.toHaveBeenCalled();
    await clickFinish(); expect(f.prove).toHaveBeenCalledOnce(); expect(f.activate).toHaveBeenCalledOnce();
  });

  it('surfaces a supported registration deadline contract error and never activates a failed operation', async () => {
    asNewAccount(); savePendingCredential(credential);
    // Contract rejection is an external observation, not invented local proof expiry.
    const revert = new ethers.utils.Interface(UniversalAccountRegistryAbi).encodeErrorResult('SignatureExpired', []);
    f.bundler.estimateUserOperationGas.mockRejectedValue(new Error(`Contract reverted ${revert}`));
    await render(); await pick(); await clickFinish();
    expect(text()).toContain('SignatureExpired'); expect(f.activate).not.toHaveBeenCalled(); expect(f.bundler.sendUserOperation).not.toHaveBeenCalled();
  });
});

describe('dispatch and status boundaries', () => {
  it('runs the real signed-in passkey manager and exposes read-only recovery after an unknown send', async () => {
    f.auth = { ...f.auth, isPasskeyUser: true, authType: 'passkey' };
    const manager = new SmartAccountTransactionManager({ accountAddress: ACCOUNT, rawCredentialId: credential.rawCredentialId,
      publicClient: f.client, bundlerClient: f.bundler, paymasterAddress: MODULE, orgId: ORG, chainId: 100 });
    f.service = new ZkEmailInvitesService({ createWritable: (address, abi) => new ethers.Contract(address, abi) }, manager, f.service.readFactory);
    f.bundler.sendUserOperation.mockRejectedValueOnce(new Error('network response lost'));
    await render(); await pick(); await clickFinish();
    expect(finish()).toBeUndefined(); expect(host.button('Check status')).toBeDefined(); expect(f.bundler.sendUserOperation).toHaveBeenCalledOnce();
    // A fresh upload cannot send a second operation while its original identity is uncertain.
    await pick(deliveredMail({ suffix: '-retry' })); await clickFinish();
    expect(f.bundler.sendUserOperation).toHaveBeenCalledOnce();
    const pending = manager.getPendingSubmission();
    f.client.getTransactionReceipt.mockResolvedValue({ ...exactOperationReceipt(pending.computedHash), blockHash: BLOCK_HASH });
    await host.click(host.button('Check status')); await flush();
    expect(text()).toContain('Transaction confirmed'); expect(manager.getPendingSubmission()).toBeNull();
    expect(f.signOp).toHaveBeenCalledOnce(); expect(f.bundler.sendUserOperation).toHaveBeenCalledOnce();
  });

  it.each(['session', 'account', 'org', 'chain', 'endpoint', 'module'])('does not dispatch when %s changes during Finish root recheck', async kind => {
    await render(); await pick(); const read = deferredRecoveryTest();
    f.client.readContract.mockReturnValueOnce(read.promise);
    let finishing; await act(async () => { finishing = host.props(finish()).onClick(); });
    changeScope(kind); await render();
    await act(async () => { read.resolve(f.list.root); await finishing; });
    expect(f.tx).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled(); expect(finish()).toBeUndefined();
  });

  it('does not dispatch or activate after a session switch during registration signing', async () => {
    asNewAccount(); savePendingCredential(credential); const signature = deferredRecoveryTest();
    f.signRegistration.mockReturnValueOnce(signature.promise);
    await render(); await pick(); let finishing;
    await act(async () => { finishing = host.props(finish()).onClick(); for (let i = 0; i < 40; i++) await Promise.resolve(); });
    expect(f.signRegistration).toHaveBeenCalledOnce();
    changeScope('session'); await render();
    await act(async () => { signature.resolve({ authenticatorData: '0x', clientDataJSON: '0x', challengeIndex: 0, typeIndex: 0, r: HASH, s: HASH }); await finishing; });
    expect(f.bundler.sendUserOperation).not.toHaveBeenCalled(); expect(f.activate).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled();
  });

  it.each(['NullifierAlreadyUsed', 'EmailAlreadyRegistered'])('shows the actual supported %s contract rejection without reproving on Finish retry', async name => {
    const { ZkEmailInvitesAbi } = await import('@poa-box/core/abis/ZkEmailInvites');
    const revert = new ethers.utils.Interface(ZkEmailInvitesAbi).encodeErrorResult(name, []);
    f.tx.mockRejectedValueOnce(new Error(`Reverted ${revert}`));
    await render(); await pick(); await clickFinish();
    expect(text()).toContain(name === 'NullifierAlreadyUsed' ? 'already been used for a claim' : 'already been used to claim a role');
    expect(f.prove).toHaveBeenCalledOnce(); expect(f.activate).not.toHaveBeenCalled(); expect(text()).not.toContain('Welcome');
  });
});

it('executes one-step domain v1 through the real register-and-claim builder and preserves the role label', async () => {
  asNewAccount(); savePendingCredential(credential); f.list = await invitationFixture({ email: false }); f.proofVersion = 'v1';
  await render(); await pick(); await clickFinish();
  expect(f.activate).toHaveBeenCalledOnce(); expect(f.bundler.sendUserOperation).toHaveBeenCalledOnce();
  expect(f.join).toHaveBeenCalledExactlyOnceWith({ address: ACCOUNT, hatIds: [DOMAIN_ROLE], username: 'member' });
  expect(text()).toContain('Your role:Member'); expect(text()).toContain('@example.test');
});

it('does not sign or optimistically join a late completion after unmount during proving', async () => {
  const proof = deferredRecoveryTest(); f.prove.mockReturnValueOnce(proof.promise);
  await render(); let picked;
  await act(async () => { picked = host.props(fileInput()).onChange({ target: { value: '', files: [{ name: 'late.eml', arrayBuffer: async () => new TextEncoder().encode(deliveredMail()).buffer }] } }); for (let i = 0; i < 40; i++) await Promise.resolve(); });
  const result = simulatedProofResult(f.inputs.mock.results[0].value, f.list, 'v2');
  await host.unmount(); await act(async () => { proof.resolve(result); await picked; });
  expect(f.tx).not.toHaveBeenCalled(); expect(f.signOp).not.toHaveBeenCalled(); expect(f.join).not.toHaveBeenCalled();
  host = createParityHost();
});

it('waits for the confirmed account to activate before optimistic membership, retaining its new username', async () => {
  asNewAccount(); savePendingCredential(credential);
  const activation = deferredRecoveryTest(); f.activate.mockReturnValueOnce(activation.promise);
  await render(); await pick(); let finishing;
  await act(async () => { finishing = host.props(finish()).onClick(); for (let i = 0; i < 100; i++) await Promise.resolve(); });
  expect(f.activate).toHaveBeenCalledOnce(); expect(f.join).not.toHaveBeenCalled();
  f.auth = { ...f.auth, accountAddress: ACCOUNT, isAuthenticated: true, isPasskeyUser: true, authType: 'passkey', sessionGeneration: 2 };
  await render();
  expect(f.join).toHaveBeenCalledExactlyOnceWith({ address: ACCOUNT, hatIds: [EMAIL_ROLE], username: 'member' });
  await act(async () => { activation.resolve(); await finishing; }); expect(f.join).toHaveBeenCalledOnce();
});
