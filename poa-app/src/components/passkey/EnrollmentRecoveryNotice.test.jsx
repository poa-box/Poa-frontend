import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it } from 'vitest';
import EnrollmentRecoveryNotice from '@/components/passkey/EnrollmentRecoveryNotice';
const render = enrollment => renderToStaticMarkup(<ChakraProvider><EnrollmentRecoveryNotice enrollment={enrollment} /></ChakraProvider>);
describe('member-facing enrollment recovery notice', () => {
  it('renders recovery-only reauthentication and explicit existing-account restart', () => {
    const html = render({ hasPendingEnrollment: true, recoveryStatus: 'reauthenticate', canRestart: true });
    expect(html).toContain('Sign in with your existing passkey');
    expect(html).toContain('Use signed-in account');
    expect(html).toContain('Original account setup transaction reference (optional)');
  });
  it('shows the fresh-email restart outcome and keeps actions disabled while checking', () => {
    const html = render({ hasPendingEnrollment: true, recoveryStatus: 'restart-ready', canRestart: true, isChecking: true });
    expect(html).toContain('Send a new verification email');
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
