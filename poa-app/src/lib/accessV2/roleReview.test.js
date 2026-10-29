import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoleReviewSession } from '@/lib/accessV2/roleReview';
import { roleFormRequest } from '@/lib/accessV2/roleFormRequest';

const ready = data => ({ status: 'ready', data, consequences: [] });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const form = { name: 'Builders', description: 'Reviewed details.', sponsorship: { enabled: false } };
function fixture() {
  const review = Object.freeze({ mode: 'create', fingerprint: 'review', requiresConfiguration: false,
    preview: { callCount: 1, createsSubject: true } });
  const prepared = Object.freeze({ mode: 'create', fingerprint: 'review', requiresConfiguration: false,
    batch: [{ target: `0x${'1'.repeat(40)}`, value: '0', calldata: '0x1234' }] });
  const describe = vi.fn(async input => ({ input: { scope: { account: 'account' }, request: roleFormRequest(input),
    snapshot: { marker: 'initial' } }, display: {} }));
  const service = { reviewRoleOperation: vi.fn(async () => ready(review)), prepareRoleOperation: vi.fn(async () => ready(prepared)),
    revalidatePreparedRoleOperation: vi.fn(async () => ready(prepared)) };
  const uploadDocument = vi.fn(async () => ({ path: 'reviewed-cid' })), assertCurrent = vi.fn(), controllers = new Set();
  return { review, prepared, describe, service, uploadDocument, assertCurrent, controllers,
    session: createRoleReviewSession({ describe, service, uploadDocument, assertCurrent,
      registerController: controller => { controllers.add(controller); return () => controllers.delete(controller); } }) };
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('host opaque review lifecycle (protocol API explicitly stubbed)', () => {
  it('reviews without publication, forwards exact core-selected bytes and preserves opaque handles for final revalidation', async () => {
    const f = fixture(), document = Object.freeze({ key: 'role-metadata', digest: 'digest', json: '{"reviewed":"bytes"}' });
    f.service.prepareRoleOperation.mockImplementation(async input => { await input.publishDocument(document, {}); return ready(f.prepared); });
    const reviewed = await f.session.review(form);
    expect(reviewed.batch).toEqual([]); expect(f.uploadDocument).not.toHaveBeenCalled();
    const built = await f.session.prepare(form);
    expect(f.uploadDocument).toHaveBeenCalledWith(document.json);
    expect(f.service.prepareRoleOperation.mock.calls[0][0].review).toBe(f.review);
    expect(Object.isFrozen(built.batch)).toBe(true); expect(Object.isFrozen(built.batch[0])).toBe(true);
    await built.revalidate();
    const final = f.service.revalidatePreparedRoleOperation.mock.calls[0][0];
    expect(final.review).toBe(f.review); expect(final.prepared).toBe(f.prepared); expect(final.snapshot).toBeUndefined();
    expect(final.publishDocument).toBeUndefined(); expect(f.uploadDocument).toHaveBeenCalledOnce();
    expect(f.describe).toHaveBeenCalledTimes(2); // final revalidation must not recover its own submitting draft
  });
  it('coalesces rapid preparation calls so one explicit submission publishes once', async () => {
    const f = fixture(), gate = deferred();
    f.service.prepareRoleOperation.mockImplementation(async input => {
      await gate.promise; await input.publishDocument({ key: 'role-metadata', digest: 'digest', json: 'reviewed bytes' }, {}); return ready(f.prepared);
    });
    await f.session.review(form); const first = f.session.prepare(form), second = f.session.prepare(form);
    gate.resolve(); expect(await first).toBe(await second);
    expect(f.service.prepareRoleOperation).toHaveBeenCalledOnce(); expect(f.uploadDocument).toHaveBeenCalledOnce();
  });
  it('refuses edited forms and superseded reviews before publication or preparation', async () => {
    const f = fixture(); await f.session.review(form);
    await expect(f.session.prepare({ ...form, description: 'Unreviewed' })).rejects.toThrow('Review the current');
    f.session.invalidate(); await expect(f.session.prepare(form)).rejects.toThrow('Review the current');
    expect(f.service.prepareRoleOperation).not.toHaveBeenCalled(); expect(f.uploadDocument).not.toHaveBeenCalled();
  });
  it('rejects an old A-to-B-to-A account/org generation even when its reads complete late', async () => {
    const f = fixture(), gate = deferred(), initial = {}, other = {};
    let scope = initial;
    f.assertCurrent.mockImplementation(() => { if (scope !== initial) throw new Error('The organization changed.'); });
    f.service.reviewRoleOperation.mockImplementation(async () => { await gate.promise; return ready(f.review); });
    const pending = f.session.review(form); await Promise.resolve(); await Promise.resolve();
    scope = other; scope = {}; gate.resolve();
    await expect(pending).rejects.toThrow('organization changed');
    expect(f.uploadDocument).not.toHaveBeenCalled();
  });
  it('suppresses an aborted review and unregisters its entire operation lifetime', async () => {
    const f = fixture(), gate = deferred(), controller = new AbortController();
    f.service.reviewRoleOperation.mockImplementation(async () => { await gate.promise; return ready(f.review); });
    const pending = f.session.review(form, { signal: controller.signal });
    await Promise.resolve(); await Promise.resolve(); expect(f.controllers.size).toBe(1);
    controller.abort(); gate.resolve(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.controllers.size).toBe(0); expect(f.uploadDocument).not.toHaveBeenCalled();
  });
  it('keeps publication receipts when an account cancellation follows the first upload', async () => {
    const f = fixture(), gate = deferred();
    f.uploadDocument.mockImplementation(async () => { await gate.promise; return { path: 'published-cid' }; });
    f.service.prepareRoleOperation.mockImplementation(async input => {
      await input.publishDocument({ key: 'role-metadata', digest: 'digest', json: 'bytes' }, { signal: input.signal });
      throw new Error('must abort');
    });
    await f.session.review(form); const pending = f.session.prepare(form);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    for (const controller of f.controllers) controller.abort(); gate.resolve();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError', publishedDocuments: [{ cid: 'published-cid', key: 'role-metadata', digest: 'digest' }] });
    expect(f.uploadDocument).toHaveBeenCalledOnce();
  });
  it('treats unknown preparation or final evidence as unavailable and emits no executable outcome', async () => {
    const f = fixture(); await f.session.review(form);
    f.service.prepareRoleOperation.mockResolvedValueOnce({ status: 'unknown', codes: ['STALE_HEAD'], publishedDocuments: [] });
    await expect(f.session.prepare(form)).rejects.toMatchObject({ code: 'ROLE_OPERATION_UNAVAILABLE' });
    await expect(f.session.prepare(form)).rejects.toThrow('Review the current');
    await f.session.review(form);
    const built = await f.session.prepare(form);
    f.service.revalidatePreparedRoleOperation.mockResolvedValueOnce({ status: 'unknown', codes: ['STALE_HEAD'] });
    await expect(built.revalidate()).rejects.toMatchObject({ code: 'ROLE_OPERATION_UNAVAILABLE' });
    expect(f.uploadDocument).not.toHaveBeenCalled();
  });
});
