import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';
import { knownFact } from '@poa-box/core/data/facts';
const f = vi.hoisted(() => ({ evidence: null, memberships: null, result: null, viewer: '', target: '', reads: [], reader: null }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: f.viewer, isAuthHydrated: true, isAuthenticated: true }) }));
vi.mock('@/hooks/accessV2/useAuthorityEvidence', () => ({ useAuthorityEvidence: () => f.evidence }));
vi.mock('@/hooks/accessV2/useAuthoritySubjects', () => ({ useAuthoritySubjects: () => ({ subjects: f.evidence.snapshot.data.subjects }) }));
vi.mock('@/hooks/accessV2/useAuthorityMemberships', () => ({ useMyMemberships: () => ({ membershipFacts: f.memberships }) }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3Services: () => ({ membershipAuthority: f.reader }) }));
import { useSubjectVouches } from '@/hooks/accessV2/useSubjectVouches';
const AUTH = `0x${'11'.repeat(20)}`, USER = `0x${'33'.repeat(20)}`, VIEWER = `0x${'44'.repeat(20)}`, ORG = `0x${'55'.repeat(32)}`;
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
const scope = { chainId: 100, orgId: ORG, contract: AUTH, endpoint: 'https://index.invalid/graphql' };
const source = { ...scope, indexed: true, snapshot: 'pinned', method: 'authority-snapshot', block: { number: '123', hash: `0x${'ab'.repeat(32)}` } };
const snapshot = (data, account) => ({ data, coverage, source: { ...source, ...(account ? { account } : {}) } });
const countFact = (value = '0', overrides = {}) => knownFact(value, { ...f.evidence.snapshot.source, account: f.target, indexed: false, method: 'vouchCount', endpoint: 'https://rpc.invalid', ...overrides });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function Probe() { f.result = useSubjectVouches('7', f.target); f.reads.push(f.result.vouchGate.can); return <button disabled={!f.result.vouchGate.can}>Vouch for them</button>; }
let host;
const render = () => act(async () => { await host.render(<Probe />); });
beforeEach(() => {
 f.viewer = VIEWER; f.target = USER; f.reads = []; host = createParityHost();
 f.evidence = { scope, authority: { enabled: true, paused: false }, enabled: true, snapshot: snapshot({
  subjects: [{ subjectId: '7', kind: 'Role', name: 'Newcomer', defaultAllow: false, vouchConfig: { quorum: '1', epoch: '2', voucherSubjectId: '9' } }, { subjectId: '9', kind: 'Role', name: 'Voucher' }],
  permissions: [], groupEdges: [], memberships: [], vouches: [],
 }) };
 f.memberships = snapshot([{ subjectId: '7', isMember: knownFact(false) }, { subjectId: '9', isMember: knownFact(true) }], VIEWER);
 f.reader = { readEffectiveVouchCount: vi.fn(async () => countFact()) };
 vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network in mounted test'); }));
});
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('first vouch for a fresh target', () => {
 it('allows a verified voucher using an observed effective zero, without inventing wearer epoch or raw count', async () => {
  await render();
  expect(f.reader.readEffectiveVouchCount).toHaveBeenCalledWith(AUTH, '7', USER, { source: { ...source, account: USER }, config: f.evidence.snapshot.data.subjects[0].vouchConfig });
  expect(f.result.facts.viewerIsVoucherMember).toMatchObject({ state: 'known', value: true });
  expect(f.result.facts.count.state).toBe('unknown'); expect(f.result.facts.effectiveCount).toMatchObject({ state: 'known', value: '0' });
  expect(f.result.progress).toMatchObject({ known: true, count: 0, met: false }); expect(f.result.vouchGate.can).toBe(true);
 });
 it('uses existing indexed counters without an extra RPC lookup', async () => {
  f.evidence.snapshot.data.memberships.push({ user: USER, subject: { subjectId: '7' }, vouchEpoch: '2', vouchCount: '0' });
  await render(); expect(f.result.vouchGate.can).toBe(true); expect(f.reader.readEffectiveVouchCount).not.toHaveBeenCalled();
 });
 it('keeps an unavailable counter unknown and the vouch disabled', async () => {
  f.reader.readEffectiveVouchCount.mockRejectedValue(new Error('Read unavailable')); await render();
  expect(f.result.progress.known).toBe(false); expect(f.result.vouchGate.can).toBe(false);
 });
 it.each(['account','contract','chainId','block','indexed','method'])('rejects a returned counter with mismatched %s', async field => {
  const bad = { account: VIEWER, contract: VIEWER, chainId: 42161, block: { ...source.block, hash: `0x${'cd'.repeat(32)}` }, indexed: true, method: 'indexed-count' };
  f.reader.readEffectiveVouchCount.mockImplementation(async () => countFact('0', { [field]: bad[field] }));
  await render(); expect(f.result.progress.known).toBe(false); expect(f.result.vouchGate.can).toBe(false);
 });
 it('rejects a counter/roster mismatch without hiding a possible previous vouch', async () => {
  f.reader.readEffectiveVouchCount.mockImplementation(async () => countFact('1')); await render();
  expect(f.result.progress.known).toBe(false); expect(f.result.vouchGate.can).toBe(false);
 });
 it('does not grant voucher membership from the new target counter', async () => {
  f.memberships.data[1].isMember = knownFact(false); await render();
  expect(f.result.progress.count).toBe(0); expect(f.result.vouchGate.can).toBe(false);
 });
 it.each(['paused','incomplete'])('does not fill an unverified %s source', async state => {
  if (state === 'paused') f.evidence.authority.paused = true;
  else f.evidence.snapshot.coverage = { ...coverage, status: 'incomplete' };
  await render(); expect(f.result.vouchGate.can).toBe(false); expect(f.reader.readEffectiveVouchCount).not.toHaveBeenCalled();
 });
 it('discards a cancelled old target response while the current target read remains pending', async () => {
  const old = deferred(), current = deferred(); const oldFact = countFact();
  f.reader.readEffectiveVouchCount.mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
  await render(); f.target = `0x${'66'.repeat(20)}`; await render();
  await act(async () => { old.resolve(oldFact); }); expect(f.result.vouchGate.can).toBe(false);
  await act(async () => { current.resolve(countFact()); }); expect(f.result.vouchGate.can).toBe(true);
 });
 it('masks the previous resolved counter synchronously on a new source block', async () => {
  await render(); expect(f.result.vouchGate.can).toBe(true);
  const next = deferred(); f.reader.readEffectiveVouchCount.mockReturnValue(next.promise);
  f.evidence.snapshot = { ...f.evidence.snapshot, source: { ...source, block: { number: '124', hash: `0x${'cd'.repeat(32)}` } } };
  f.reads = []; await render(); expect(f.reads).not.toContain(true);
  await act(async () => { next.resolve(countFact()); }); expect(f.result.vouchGate.can).toBe(false); // viewer proof still belongs to block 123
 });
});
