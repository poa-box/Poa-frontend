import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { ethers } from 'ethers';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], auth: {}, po: {}, user: {}, name: 'member',
  setName: vi.fn(), close: vi.fn(), add: vi.fn(), update: vi.fn(), emit: vi.fn(), wait: vi.fn(), toast: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (compute, deps) => {
    const index = fixture.cursor++; const previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: compute() };
    return fixture.slots[index].value;
  };
  return { ...actual, useRef: value => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: value }; },
    useState: value => { const index = fixture.cursor++; fixture.slots[index] ||= { value }; return [fixture.slots[index].value, next => { fixture.slots[index].value = next; }]; },
    useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (effect, deps) => memo(() => { fixture.effects.push(effect); }, deps),
  };
});
vi.mock('@chakra-ui/react', () => ({ Modal: 'dialog', ModalOverlay: 'overlay', ModalContent: 'content', ModalHeader: 'header', ModalFooter: 'footer', ModalBody: 'body',
  ModalCloseButton: 'close-button', Button: 'button', FormControl: 'form', FormLabel: 'label', Input: 'input', useToast: () => fixture.toast }));
vi.mock('@/context/authState', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => fixture.po }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ graphUsername: fixture.name, setGraphUsername: fixture.setName }) }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: fixture.add, updateNotification: fixture.update }) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshEmit: () => ({ emit: fixture.emit }) }));
vi.mock('@/util/waitForSubgraph', () => ({ waitForSubgraphBlock: (...args) => fixture.wait(...args) }));
vi.mock('@/hooks/useWeb3Services', async () => {
  const { useTransactionWithNotification } = await import('@/hooks/useTransactionWithNotification');
  return { useWeb3: () => ({ user: fixture.user, isReady: true, getNotReadyMessage: () => 'Loading', ...useTransactionWithNotification() }) };
});
import AccountSettingsModal from '@/components/userPage/AccountSettingsModal';
import { executeUsernameUpdate } from '@/services/web3/core/accountActions';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
const source = { account: ACCOUNT, contract: REGISTRY, chainId: 100, endpoint: 'https://registered.test', indexed: true, snapshot: 'latest', method: 'graph' };
function find(element, predicate) {
  if (!React.isValidElement(element)) return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
const Harness = () => { fixture.cursor = 0; const element = AccountSettingsModal({ isOpen: true, onClose: fixture.close }); for (const effect of fixture.effects.splice(0)) effect(); return element; };
const edit = () => { find(Harness(), element => element.type === 'input').props.onChange({ target: { value: 'new_member' } }); return find(Harness(), element => element.type === 'button' && element.props.children === 'Save').props.onClick; };
beforeEach(() => {
  vi.clearAllMocks(); fixture.slots = []; fixture.effects = []; fixture.name = 'member';
  fixture.auth = { accountAddress: ACCOUNT, authType: 'eoa', isAuthenticated: true, isAuthHydrated: true, sessionGeneration: 1 };
  fixture.po = { orgId: 'another-org', orgChainId: 42161, subgraphUrl: 'https://org.test' };
  fixture.add.mockReturnValue('pending-1'); fixture.wait.mockResolvedValue();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('username form through selected source, actual core intent and host notifications', () => {
  function host() {
    const result = { success: true, txHash: 'synthetic-hash', blockNumber: 42 };
    const manager = { execute: vi.fn(async () => result) };
    const factory = { createWritable: (address, abi) => ({ address, interface: new ethers.utils.Interface(abi) }) };
    fixture.user = { changeUsername: (username, options) => executeUsernameUpdate({ username, options, guard: () => {},
      resolveSource: async () => ({ source }), createHost: async () => ({ factory, manager }) }) };
    return { result, manager };
  }
  it('refreshes the actual registration endpoint and keeps the existing optimistic form and manager API', async () => {
    const { manager } = host();
    await edit()(); await Promise.resolve();
    expect(manager.execute).toHaveBeenCalledWith(expect.objectContaining({ address: REGISTRY }), 'changeUsername', ['new_member'], { value: '0' });
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith(source.endpoint, 42);
    expect(fixture.emit).toHaveBeenCalledWith('user:username_changed', { transactionHash: 'synthetic-hash', chainId: 100, subgraphUrl: source.endpoint });
    expect(fixture.setName).toHaveBeenCalledExactlyOnceWith('new_member'); expect(fixture.close).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps submitted action status but cannot update the new account username or close its form', async () => {
    const { manager, result } = host(); let done, entered;
    const started = new Promise(resolve => { entered = resolve; });
    manager.execute.mockImplementation(() => new Promise(resolve => { done = resolve; entered(); }));
    const save = edit()();
    await started;
    fixture.auth = { ...fixture.auth, accountAddress: REGISTRY, sessionGeneration: 2 }; Harness();
    done(result); await save;
    expect(fixture.setName).not.toHaveBeenCalled(); expect(fixture.close).not.toHaveBeenCalled(); expect(fixture.emit).not.toHaveBeenCalled();
    expect(fixture.update).toHaveBeenCalledWith('pending-1', expect.stringContaining('earlier action'), 'error');
  });
});
