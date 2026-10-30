import { useMemo } from 'react';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import { projectVouchEligibility } from '@poa-box/core/authority/lifecycle';
import { useAuth } from '@/context/authState';
import { normalizeVouchRecords, normalizeVouchConfig, vouchProgressCopy, canVouch } from '@/lib/accessV2/vouch';
import { useAuthorityEvidence } from '@/hooks/accessV2/useAuthorityEvidence';
import { useAuthoritySubjects } from '@/hooks/accessV2/useAuthoritySubjects';
import { useMyMemberships } from '@/hooks/accessV2/useAuthorityMemberships';

export function useSubjectVouches(subjectId, targetUser) {
  const evidence = useAuthorityEvidence();
  const { snapshot, scope, authority } = evidence;
  const { subjects } = useAuthoritySubjects();
  const { accountAddress, isAuthHydrated, isAuthenticated } = useAuth();
  const { membershipFacts } = useMyMemberships();
  const user = String(targetUser || '').toLowerCase();
  const viewer = isAuthHydrated && isAuthenticated ? String(accountAddress || '').toLowerCase() : '';
  return useMemo(() => {
    const subject = subjects.find(row => row.subjectId === String(subjectId)) || null;
    const current = snapshot?.data.subjects.find(row => row.subjectId === String(subjectId));
    const config = normalizeVouchConfig(current?.vouchConfig);
    const rows = (snapshot?.data.vouches || []).filter(row => row.subjectId === String(subjectId) && row.user.toLowerCase() === user);
    const records = normalizeVouchRecords(rows);
    const target = snapshot?.data.memberships.find(row => row.subject.subjectId === String(subjectId) && row.user.toLowerCase() === user);
    const targetSource = snapshot ? { ...snapshot.source, account: user } : null;
    const fact = value => value == null ? unknownFact('VOUCH_COUNTER_UNAVAILABLE', targetSource) : knownFact(String(value), targetSource);
    const facts = snapshot && user && viewer && membershipFacts ? projectVouchEligibility({
      records: { ...snapshot, source: targetSource, data: rows }, scope: { ...scope, account: user },
      subjectId: String(subjectId), config: current ? knownFact(current.vouchConfig, targetSource) : unknownFact('VOUCH_CONFIG_UNAVAILABLE'),
      wearerEpoch: fact(target?.vouchEpoch), rawCount: fact(target?.vouchCount), authority: snapshot,
      viewerMemberships: membershipFacts, viewerScope: { ...scope, account: viewer },
    }) : null;
    const known = facts?.count.state === 'known' && facts?.met.state === 'known';
    const count = known ? Number(facts.count.value) : null;
    const quorum = Number(config?.quorum || 0);
    const progress = { count, quorum, met: known && facts.met.value,
      remaining: known ? Math.max(0, quorum - count) : null, known };
    const gate = canVouch({ config, records: normalizeVouchRecords(facts?.liveRecords || []), viewer, target: user,
      viewerIsVoucherMember: facts?.viewerIsVoucherMember.state === 'known' && facts.viewerIsVoucherMember.value,
      paused: authority.paused });
    return { ...evidence, subject, config, records, progress, facts,
      progressCopy: known ? vouchProgressCopy(progress) : 'Current vouches could not be verified.',
      viewerHasVouched: Boolean(facts?.liveRecords.some(row => row.voucher.toLowerCase() === viewer)),
      vouchGate: !known ? { can: false, reason: 'Current vouches could not be verified. Please retry.' } : gate };
  }, [evidence, snapshot, scope, subjects, subjectId, user, viewer, membershipFacts, authority.paused]);
}

export default useSubjectVouches;
