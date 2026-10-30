import { normalizeSubjectId } from '@poa-box/core/authority/ids';

/** Display only: the registry remains the authority for an actual metadata write. */
export function resolveMetadataAdminDisplay({ metadataAdminHatId, topHatId, userHatIds }) {
  if (metadataAdminHatId === undefined || !Array.isArray(userHatIds)) return null;
  try {
    const override = metadataAdminHatId == null ? '0' : normalizeSubjectId(metadataAdminHatId);
    const subject = override === '0' ? (topHatId == null ? null : normalizeSubjectId(topHatId)) : override;
    if (subject === null) return null;
    return userHatIds.some(id => normalizeSubjectId(id) === subject);
  } catch {
    return null;
  }
}
