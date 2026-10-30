import { useSolidarityOnboarding } from '@/hooks/useSolidarityOnboarding';
import PasskeyOnboardingDialog from './PasskeyOnboardingDialog';

/** Account-only creation; organization membership is completed separately. */
export default function SolidarityOnboardingModal({ isOpen, onClose, onSuccess, variant, needsVouch = false }) {
  const onboarding = useSolidarityOnboarding();

  return (
    <PasskeyOnboardingDialog
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      variant={variant}
      accountOnly
      onboarding={onboarding}
      startOnboarding={onboarding.startOnboarding}
      successTitle={variant === 'join' ? 'Your account is ready' : undefined}
      successMessage={variant === 'join'
        ? needsVouch
          ? 'Your account is ready. Copy your vouch link below and ask a member to vouch before you join.'
          : 'Your account is ready. Choose a role below to finish joining the community.'
        : 'Your passkey account has been created. Browse and join organizations to get started!'}
      successActionLabel={variant === 'join' ? 'Continue joining' : 'Start Exploring'}
    />
  );
}
