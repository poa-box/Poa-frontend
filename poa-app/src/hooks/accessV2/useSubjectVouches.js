import { useEffect, useMemo, useState } from 'react';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import { projectVouchEligibility } from '@poa-box/core/authority/lifecycle';
import { useAuth } from '@/context/authState';
import { useWeb3Services } from '@/hooks/useWeb3Services';
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
  const { membershipAuthority } = useWeb3Services();
  const currentSubject = snapshot?.data.subjects.find(row => row.subjectId === String(subjectId));
  const targetMembership = snapshot?.data.memberships.find(row => row.subject.subjectId === String(subjectId) && row.user.toLowerCase() === user);
  const missingCounter = targetMembership?.vouchEpoch == null || targetMembership?.vouchCount == null;
  const counterKey = JSON.stringify([scope, snapshot?.source, subjectId, user, viewer, currentSubject?.vouchConfig]);
  const [counterRead, setCounterRead] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!missingCounter || !viewer || !user || !authority.enabled || authority.paused || authority.loading || authority.error
      || evidence.loading || evidence.error || snapshot?.coverage.status !== 'complete' || !currentSubject?.vouchConfig
      || !membershipAuthority?.readEffectiveVouchCount) return undefined;
    setCounterRead(null);
    membershipAuthority.readEffectiveVouchCount(scope.contract, subjectId, user, {
      source: { ...snapshot.source, account: user }, config: currentSubject.vouchConfig,
    }).then(count => {
      if (!cancelled) setCounterRead({ key: counterKey, snapshot, reader: membershipAuthority, count });
    }).catch(() => { /* Missing or inconsistent observations stay unknown. */ });
    return () => { cancelled = true; };
  }, [missingCounter, viewer, user, authority.enabled, authority.paused, authority.loading, authority.error,
    evidence.loading, evidence.error, snapshot, currentSubject, membershipAuthority, scope.contract, subjectId, counterKey]);
  const observedCount = counterRead?.key === counterKey && counterRead.snapshot === snapshot
    && counterRead.reader === membershipAuthority ? counterRead.count : null;
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
    // A live effective count can fill a missing indexed counter without inventing
    // the private wearer epoch. It never replaces viewer membership or roster evidence.
    const effectiveCount = missingCounter && observedCount?.state === 'known'
      && snapshot?.coverage.status === 'complete' && observedCount.source?.indexed === false
      && observedCount.source?.method === 'vouchCount'
      && observedCount.source?.chainId === scope.chainId && observedCount.source?.orgId === scope.orgId
      && observedCount.source?.contract?.toLowerCase() === scope.contract?.toLowerCase()
      && observedCount.source?.account?.toLowerCase() === user
      && observedCount.source?.block?.number === snapshot.source.block?.number
      && observedCount.source?.block?.hash?.toLowerCase() === snapshot.source.block?.hash?.toLowerCase()
      && /^(0|[1-9][0-9]*)$/.test(observedCount.value) && BigInt(observedCount.value) <= 4294967295n
      && BigInt(observedCount.value) === BigInt(facts?.liveRecords.length ?? -1)
      ? observedCount : unknownFact('EFFECTIVE_VOUCH_COUNT_UNAVAILABLE');
    const indexedKnown = facts?.count.state === 'known' && facts?.met.state === 'known';
    const known = indexedKnown || effectiveCount.state === 'known';
    const count = known ? Number(indexedKnown ? facts.count.value : effectiveCount.value) : null;
    const quorum = Number(config?.quorum || 0);
    const progress = { count, quorum, met: known && (indexedKnown ? facts.met.value : quorum > 0 && count >= quorum),
      remaining: known ? Math.max(0, quorum - count) : null, known };
    const gate = canVouch({ config, records: normalizeVouchRecords(facts?.liveRecords || []), viewer, target: user,
      viewerIsVoucherMember: facts?.viewerIsVoucherMember.state === 'known' && facts.viewerIsVoucherMember.value,
      paused: authority.paused });
    return { ...evidence, subject, config, records, progress, facts: facts && { ...facts, effectiveCount },
      progressCopy: known ? vouchProgressCopy(progress) : 'Current vouches could not be verified.',
      viewerHasVouched: Boolean(facts?.liveRecords.some(row => row.voucher.toLowerCase() === viewer)),
      vouchGate: !known ? { can: false, reason: 'Current vouches could not be verified. Please retry.' } : gate };
  }, [evidence, snapshot, scope, subjects, subjectId, user, viewer, membershipFacts, authority.paused, missingCounter, observedCount]);
}

export default useSubjectVouches;
