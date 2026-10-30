/** Display facts from a complete native authority observation; absent fields remain unknown. */
export function enrollmentRoleFacts(subject, complete) {
  const raw = subject?.raw || subject;
  const openKnown = complete && typeof raw?.defaultAllow === 'boolean';
  const configKnown = complete && raw && Object.prototype.hasOwnProperty.call(raw, 'vouchConfig')
    && (raw.vouchConfig === null || (/^\d+$/.test(String(raw.vouchConfig?.quorum)) && raw.vouchConfig?.quorum !== null));
  return { openKnown: Boolean(openKnown), isOpen: openKnown ? raw.defaultAllow : null,
    vouchingKnown: Boolean(configKnown), vouchingEnabled: configKnown ? BigInt(raw.vouchConfig?.quorum ?? 0) > 0n : null,
    vouchingQuorum: configKnown ? String(raw.vouchConfig?.quorum ?? 0) : null,
    vouchingMembershipHatId: configKnown ? raw.vouchConfig?.voucherSubjectId ?? null : null };
}
