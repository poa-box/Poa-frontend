import { describe, it, expect } from 'vitest';
import { ReleaseReason, releaseActionLabel, releaseConfirmCopy } from '@/util/releaseGate';

describe('copy helpers', () => {
  it('labels the two routes differently', () => {
    expect(releaseActionLabel(ReleaseReason.SELF_RELEASE)).toBe('Release task');
    expect(releaseActionLabel(ReleaseReason.THIRD_PARTY_EXPIRED)).toBe('Release claim');
  });

  it('names the claimer in third-party copy and stays generic without a name', () => {
    expect(releaseConfirmCopy(ReleaseReason.THIRD_PARTY_EXPIRED, 'alice')).toContain("alice's");
    expect(releaseConfirmCopy(ReleaseReason.THIRD_PARTY_EXPIRED, '')).toContain('this expired claim');
  });

  it('self-release copy warns the task reopens to everyone', () => {
    expect(releaseConfirmCopy(ReleaseReason.SELF_RELEASE)).toMatch(/anyone/i);
  });
});
