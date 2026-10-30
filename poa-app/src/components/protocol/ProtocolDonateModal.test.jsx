import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ amount: '', buttons: [], donate: vi.fn(), confirmed: null, sending: false, capable: true }));
vi.mock('react', async original => ({ ...await original(), useState: () => [fixture.amount, value => { fixture.amount = value; }] }));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react'), { mockChakra } = await import('@/test/mockChakra');
  const chakra = mockChakra(fixture.buttons);
  chakra.Input = props => createElement('input', { value: props.value, readOnly: true });
  return chakra;
});
vi.mock('@/hooks/useProtocolDonation', () => ({ useProtocolDonation: (_chain, _open, success) => {
  fixture.confirmed = success; return { donate: fixture.donate, canDonate: fixture.capable, isSending: fixture.sending };
} }));
import ProtocolDonateModal from '@/components/protocol/ProtocolDonateModal';
const close = vi.fn();
const render = () => { fixture.buttons.length = 0; return renderToStaticMarkup(<ProtocolDonateModal isOpen onClose={close} chain={{ name: 'Community network', nativeCurrency: 'xDAI' }} />); };
beforeEach(() => { vi.clearAllMocks(); fixture.amount = '0.000000000000000001'; fixture.sending = false; fixture.capable = true; fixture.donate.mockResolvedValue({ success: false }); });
describe('donation form draft and exact native units', () => {
  it('converts the draft exactly and retains it through cancellation/failure until a confirmed success', async () => {
    render(); await fixture.buttons.find(button => button.children === 'Donate').onClick();
    expect(fixture.donate).toHaveBeenCalledExactlyOnceWith('1');
    expect(fixture.amount).toBe('0.000000000000000001'); expect(close).not.toHaveBeenCalled();
    fixture.buttons.find(button => button.children === 'Cancel').onClick(); expect(fixture.amount).toBe('0.000000000000000001');
    close.mockClear(); fixture.confirmed(); expect(fixture.amount).toBe(''); expect(close).toHaveBeenCalledOnce();
  });
  it.each(['0', '-1', '1e-18', '0.0000000000000000001', ''])('does not submit invalid draft %s', async amount => {
    fixture.amount = amount; render(); const button = fixture.buttons.find(button => button.children === 'Donate');
    expect(button.isDisabled).toBe(true); await button.onClick(); expect(fixture.donate).not.toHaveBeenCalled();
  });
  it('preserves large integer precision and blocks missing EOA capability', async () => {
    fixture.amount = '9007199.254740993123456789'; render(); await fixture.buttons.find(button => button.children === 'Donate').onClick();
    expect(fixture.donate).toHaveBeenCalledWith('9007199254740993123456789');
    fixture.donate.mockClear(); fixture.capable = false; render();
    const button = fixture.buttons.find(button => button.children === 'Donate'); expect(button.isDisabled).toBe(true);
    await button.onClick(); expect(fixture.donate).not.toHaveBeenCalled();
  });
});
