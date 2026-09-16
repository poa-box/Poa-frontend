export function withFreshAcceptance(roster, fresh) {
  const out = new Set([...(roster || [])].map((a) => String(a).toLowerCase()));
  for (const [addr, accepted] of Object.entries(fresh || {})) {
    const key = String(addr).toLowerCase();
    if (accepted) out.add(key);
    else out.delete(key);
  }
  return out;
}
export function resolveV2SubjectName(accessV2, subjectId) {
  const id = String(subjectId ?? '');
  if (!id) return 'this role';
  const pool = [...(accessV2?.roles || []), ...(accessV2?.subjects || [])];
  const hit = pool.find((s) => String(s?.subjectId ?? s?.id ?? '') === id);
  const name = hit?.name && String(hit.name).trim();
  if (name) return name;
  return `role ${id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id}`;
}
