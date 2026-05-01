const HUDSONHRH_ALLOWED = new Set(['poa', 'kubi']);

export function filterUserOrgsForViewedProfile(orgs, profileUsername) {
  const owner = profileUsername?.trim().toLowerCase();
  if (owner === 'hudsonhrh') {
    return (orgs || []).filter((entry) =>
      HUDSONHRH_ALLOWED.has(entry?.organization?.name?.trim().toLowerCase())
    );
  }
  return orgs || [];
}
