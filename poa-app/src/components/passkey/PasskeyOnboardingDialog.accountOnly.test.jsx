import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra());
vi.mock('@/components/common/WalletActionButton', () => ({ useWalletAction: () => ({ cancel: vi.fn() }) }));
vi.mock('@/components/passkey/EnrollmentRecoveryNotice', () => ({ default: () => null }));
vi.mock('@/components/shared/useOnboardingColors', () => ({ default: () => ({ ink: 'black', muted: 'gray' }) }));
import PasskeyOnboardingDialog from '@/components/passkey/PasskeyOnboardingDialog';
import { OnboardingStep } from '@/services/web3/domain/PasskeyOnboardingService';
describe('account-only and atomic onboarding progress', () => {
 it.each([
  [OnboardingStep.BUILDING_TRANSACTION, true, 'Preparing your account…'],
  [OnboardingStep.CONFIRMING, true, 'Confirming your account setup…'],
  [OnboardingStep.BUILDING_TRANSACTION, false, 'Preparing your membership…'],
  [OnboardingStep.CONFIRMING, false, 'Confirming your membership…'],
 ])('describes step %s accurately with accountOnly=%s', (step, accountOnly, label) => {
  const text = renderToStaticMarkup(<PasskeyOnboardingDialog variant="join" accountOnly={accountOnly} isOpen onboarding={{ step, isOnboarding: true, isReady: true }} />);
  expect(text).toContain(label); if (accountOnly) expect(text).not.toContain('your membership');
 });
});
