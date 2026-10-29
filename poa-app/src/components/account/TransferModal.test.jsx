import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TransferModal from '@/components/account/TransferModal';
const fixture = vi.hoisted(() => ({ states: [], cursor: 0, buttons: [], current: true, transfer: null, factory: null, toast: null, auth: null }));
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return { ...actual, useState: initial => [fixture.states[fixture.cursor++] ?? initial, vi.fn()] };
});
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const chakra = (await import('@/test/mockChakra')).mockChakra();
  chakra.Button = props => { fixture.buttons.push(props); return createElement('button', { disabled: props.isDisabled }, props.children); };
  chakra.useToast = () => fixture.toast;
  return chakra;
});
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({ chain: { id: 100 } }),
  useConfig: () => ({}), useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  getConnectorClient: vi.fn(), clientToSigner: vi.fn(),
}));
vi.mock('@/context/authState', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/lib/organization/useOrganizationWriteScope', () => ({ useOrganizationWriteScope: () => () => ({
  isCurrent: () => fixture.current,
  assertCurrent: () => { if (!fixture.current) throw new Error('stale'); },
}) }));
vi.mock('@/hooks/useTransactionWithNotification', () => ({ useTransactionWithNotification: () => ({
  executeWithNotification: async operation => { try { return await operation(); } catch (error) { return { success: false, error }; } },
}) }));
vi.mock('@/services/web3/domain/AccountTransferService', () => ({ createAccountTransferService: (...args) => fixture.factory(...args) }));
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x3333333333333333333333333333333333333333';
const TOKEN = { address: '0x2222222222222222222222222222222222222222', chainId: 100,
  chainName: 'Organization network', balance: '9007199254740993123456789', decimals: 18, symbol: 'USDC' };
beforeEach(() => {
  fixture.states = [RECIPIENT, '0.000000000000000001', 'form', null];
  fixture.cursor = 0; fixture.buttons = []; fixture.current = true; fixture.toast = vi.fn();
  fixture.auth = { accountAddress: ACCOUNT, isAuthHydrated: true, isPasskeyUser: false, isSessionCurrent: () => true };
  fixture.transfer = vi.fn(async () => ({ success: true }));
  fixture.factory = vi.fn(async () => ({ transferERC20: fixture.transfer }));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
const render = (onSuccess, nativeBalance = '1') => {
  renderToStaticMarkup(<TransferModal isOpen token={TOKEN} accountAddress={ACCOUNT} nativeBalance={nativeBalance}
    onClose={vi.fn()} onSuccess={onSuccess} />);
  return fixture.buttons.find(button => Array.isArray(button.children) && button.children[0] === 'Send ');
};
describe('transfer modal service and lifecycle integration', () => {
  it.each([
    ['0.000000000000000001', '1'], ['9007199.254740993123456789', '9007199254740993123456789'],
  ])('sends exact decimal text %s and only reports confirmed success', async (amount, expected) => {
    fixture.states[1] = amount;
    const success = vi.fn(); const button = render(success);
    expect(button.isDisabled).toBe(false);
    await button.onClick();
    expect(fixture.transfer).toHaveBeenCalledWith(TOKEN.address, RECIPIENT, expected);
    expect(success).toHaveBeenCalledOnce();
    expect(fixture.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not report success for a manager failure', async () => {
    fixture.transfer.mockResolvedValue({ success: false, error: { userMessage: 'Transfer refused' } });
    const success = vi.fn(); await render(success).onClick();
    expect(success).not.toHaveBeenCalled();
    expect(fixture.toast).not.toHaveBeenCalled();
  });
  it('suppresses late success after the selected account/token scope changes', async () => {
    let finish;
    fixture.transfer.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const success = vi.fn(), button = render(success);
    const sent = button.onClick();
    await vi.waitFor(() => expect(fixture.transfer).toHaveBeenCalledOnce());
    fixture.current = false; finish({ success: true }); await sent;
    expect(success).not.toHaveBeenCalled(); expect(fixture.toast).not.toHaveBeenCalled();
  });
  it('blocks unresolved identity before service execution', async () => {
    fixture.auth.isAuthHydrated = false;
    const success = vi.fn(), button = render(success);
    await button.onClick();
    expect(fixture.factory).not.toHaveBeenCalled();
    expect(fixture.transfer).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
  it('prevents a second submission while the first request is in flight', async () => {
    let finish;
    fixture.transfer.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const button = render(vi.fn());
    const first = button.onClick();
    await vi.waitFor(() => expect(fixture.transfer).toHaveBeenCalledOnce());
    await button.onClick();
    expect(fixture.factory).toHaveBeenCalledOnce();
    expect(fixture.transfer).toHaveBeenCalledOnce();
    finish({ success: true }); await first;
  });
  it('refuses a transfer that has no fee balance or exceeds the exact asset balance', () => {
    expect(render(vi.fn(), '0').isDisabled).toBe(true);
    fixture.cursor = 0; fixture.buttons = []; fixture.states[1] = '9007200';
    expect(render(vi.fn()).isDisabled).toBe(true);
  });
});
