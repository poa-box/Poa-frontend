import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const f = vi.hoisted(() => ({ props: null, start: vi.fn() }));
vi.mock('@/hooks/useSolidarityOnboarding', () => ({ useSolidarityOnboarding: () => ({ startOnboarding: f.start }) }));
vi.mock('@/components/passkey/PasskeyOnboardingDialog', () => ({ default: props => { f.props = props; return null; } }));
import SolidarityOnboardingModal from '@/components/passkey/SolidarityOnboardingModal';
beforeEach(() => { f.props = null; });
describe('account-only onboarding copy', () => {
 it('distinguishes account creation from joining a vouch-gated organization', () => {
  const onSuccess = vi.fn(); renderToStaticMarkup(<SolidarityOnboardingModal variant="join" needsVouch onSuccess={onSuccess} />);
  expect(f.props).toMatchObject({ variant: 'join', accountOnly: true, successTitle: 'Your account is ready', successActionLabel: 'Continue joining', onSuccess });
  expect(f.props.successMessage).toContain('before you join'); expect(f.props.successMessage).not.toContain("you've joined");
 });
 it('guides a native open-role account back to separate membership selection', () => {
  renderToStaticMarkup(<SolidarityOnboardingModal variant="join" />); expect(f.props.successMessage).toContain('Choose a role below');
 });
 it('preserves the homepage account-only presentation and action', () => {
  renderToStaticMarkup(<SolidarityOnboardingModal />); expect(f.props.successTitle).toBeUndefined(); expect(f.props.successActionLabel).toBe('Start Exploring');
  expect(f.props.startOnboarding).toBe(f.start);
 });
});
