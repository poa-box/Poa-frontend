import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';
import { OnboardingStep } from '@/services/web3/domain/PasskeyOnboardingService';
const f = vi.hoisted(() => ({ start: vi.fn(), reset: vi.fn(), toast: vi.fn() }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/parityHost')).parityChakra(f.toast));
vi.mock('@/components/common/WalletActionButton', () => ({ useWalletAction: () => ({ run: vi.fn(), cancel: vi.fn(), prepare: vi.fn(), pending: false }) }));
vi.mock('@/components/shared/useOnboardingColors', () => ({ default: () => ({}) }));
vi.mock('@/components/passkey/EnrollmentRecoveryNotice', () => ({ default: () => null }));
vi.mock('react-icons/fa', () => ({ FaCheck: () => null, FaExclamationTriangle: () => null, FaFingerprint: () => null, FaWallet: () => null }));
import PasskeyOnboardingDialog from '@/components/passkey/PasskeyOnboardingDialog';
let host;
const enrollment = change => ({ step: OnboardingStep.IDLE, isReady: true, isOnboarding: false, reset: f.reset,
  hasPendingEnrollment: true, recoveryStatus: 'not-submitted', pendingEnrollment: { key: 'source-a',
    credential: { flow: 'onboarding', credentialId: 'same-passkey', username: 'taken_name' } }, ...change });
const render = onboarding => host.render(<PasskeyOnboardingDialog isOpen variant="join" onboarding={onboarding}
  startOnboarding={f.start} onClose={vi.fn()} successMessage="Ready" successActionLabel="Continue" />);
const input = () => host.nodes().find(n => n.tagName === 'INPUT');
beforeEach(() => { vi.clearAllMocks(); f.start.mockResolvedValue(undefined); host = createParityHost(); });
afterEach(async () => { await host.unmount(); vi.unstubAllGlobals(); });

describe('saved passkey username form', () => {
  it('seeds the saved username on reload and resumes it when unchanged', async () => {
    await render(enrollment()); expect(host.props(input()).value).toBe('taken_name');
    await host.click(host.button('Create account')); expect(f.start).toHaveBeenCalledWith('taken_name');
  });
  it('submits the edited visible username rather than forcing the old pending name', async () => {
    await render(enrollment()); await host.change(input(), 'new_free_name');
    await host.click(host.button('Create account')); expect(f.start).toHaveBeenCalledWith('new_free_name');
  });
  it('keeps recovery gating while allowing an edited username after Try again', async () => {
    await render(enrollment({ step: OnboardingStep.ERROR, error: new Error('UsernameTaken') }));
    await host.click(host.button('Try again')); expect(f.reset).toHaveBeenCalledOnce();
    await render(enrollment()); await host.change(input(), 'new_free_name');
    await host.click(host.button('Create account')); expect(f.start).toHaveBeenCalledWith('new_free_name');
  });
  it.each(['unknown', 'succeeded', null])('disables setup for unresolved/successful pending status %s', async recoveryStatus => {
    await render(enrollment({ recoveryStatus })); await host.change(input(), 'new_free_name');
    expect(host.button('Create account').disabled).toBe(true); expect(f.start).not.toHaveBeenCalled();
  });
  it('rebinds the displayed username when a different saved source is selected', async () => {
    await render(enrollment()); await host.change(input(), 'unsaved_edit');
    await render(enrollment({ pendingEnrollment: { key: 'source-b', credential: { flow: 'onboarding', credentialId: 'other-passkey', username: 'other_name' } } }));
    expect(host.props(input()).value).toBe('other_name');
  });
});
