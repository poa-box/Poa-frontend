import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ directory: {} }));
vi.mock('@/context/profileHubContext', () => ({ useProfileHubContext: () => f.directory }));
import useLandingRegistry from '@/components/marketing/landing/useLandingRegistry';
function observe() {
  let value;
  function Consumer() { value = useLandingRegistry(); return null; }
  renderToStaticMarkup(<Consumer />);
  return value;
}
describe('landing registry current-member aggregate availability', () => {
  it.each([null, undefined])('keeps unknown organization totals %s out of the aggregate', value => {
    f.directory = { isComplete: true, perpetualOrganizations: [{ id: 'Community', totalMembers: value }, { id: 'Another', totalMembers: 11 }] };
    expect(observe().counts.members).toBeNull();
  });
  it('distinguishes verified zero, exact totals and incomplete chain coverage', () => {
    f.directory = { isComplete: true, perpetualOrganizations: [{ id: 'Community', totalMembers: 0 }] };
    expect(observe().counts.members).toBe(0);
    f.directory.perpetualOrganizations.push({ id: 'Another', totalMembers: 11 });
    expect(observe().counts.members).toBe(11);
    f.directory.isComplete = false; expect(observe().counts.members).toBeNull();
  });
});
