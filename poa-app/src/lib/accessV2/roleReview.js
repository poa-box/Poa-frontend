/** Host review lifetime and publication adapter. Opaque core handles stay in memory. */
import { buildRoleFormBatch, normalizeRoleForm } from '@/lib/accessV2/roleFormBatch';
import { requireRoleOperation } from '@/lib/accessV2/roleOperationHost';
import { assertRoleObservationActive } from '@/lib/accessV2/roleObservationWork';

const formKey = form => JSON.stringify(normalizeRoleForm(form));
export function createRoleReviewSession({ describe, service, fetchDocument, uploadDocument, assertCurrent = () => {},
  registerController = () => () => {} }) {
  let reviewed = null, generation = 0;
  const work = async (signal, run) => {
    const controller = new AbortController(), cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) controller.abort();
    const unregister = registerController(controller);
    const current = () => { assertRoleObservationActive(controller.signal); assertCurrent(); };
    try { current(); return await run(controller.signal, current); }
    finally { signal?.removeEventListener('abort', cancel); unregister(); }
  };
  const adapt = (record, operation, preview) => buildRoleFormBatch({ form: record.form,
    ...record.display, operation, review: record.review, preview });
  return {
    invalidate() { generation++; reviewed = null; },
    review(input, { signal } = {}) {
      const version = ++generation;
      reviewed = null;
      return work(signal, async (signal, current) => {
        const form = structuredClone(normalizeRoleForm(input));
        const context = await describe(form, { signal }); current();
        const operation = await service.reviewRoleOperation({ ...context.input, fetchDocument, signal });
        current();
        const review = requireRoleOperation(operation);
        if (version !== generation) throw new Error('The role changed. Review it again.');
        reviewed = { form, key: formKey(form), review, display: context.display, publications: [] };
        return adapt(reviewed, operation, true);
      });
    },
    prepare(input, { signal } = {}) {
      const record = reviewed;
      if (!record || record.key !== formKey(input)) return Promise.reject(new Error('Review the current role configuration before creating this vote.'));
      const unchanged = () => {
        assertCurrent();
        if (reviewed !== record) throw new Error('The role changed. Review it again.');
      };
      if (record.preparing) return record.preparing;
      record.preparing = work(signal, async (signal, current) => {
        unchanged();
        const context = await describe(record.form, { signal }); current(); unchanged();
        const publishDocument = async (document, { signal } = {}) => {
          assertRoleObservationActive(signal); unchanged();
          let uploaded;
          try { uploaded = await uploadDocument(document.json); }
          catch (error) {
            record.publications.push({ key: document.key, digest: document.digest, status: 'unknown' });
            throw error;
          }
          const cid = typeof uploaded === 'string' ? uploaded : uploaded?.path;
          // Capture the unsigned publication receipt BEFORE a scope/cancellation guard can throw.
          record.publications.push({ key: document.key, digest: document.digest, cid });
          try { assertRoleObservationActive(signal); unchanged(); }
          catch (error) { error.publishedDocuments = record.publications.filter(row => row.cid); throw error; }
          return { cid };
        };
        const operation = await service.prepareRoleOperation({ ...context.input, review: record.review,
          currentRequest: context.input.request, fetchDocument, publishDocument, signal });
        current(); unchanged();
        const prepared = requireRoleOperation(operation);
        const built = adapt(record, operation, false);
        if (!built.submittable.ok) throw new Error(built.submittable.message);
        for (const call of built.batch) Object.freeze(call);
        Object.freeze(built.batch);
        return { ...built, revalidate: () => work(undefined, async (signal, current) => {
          unchanged();
          // Do not recover the host draft here: its new stage has just been marked
          // submitting. Core reobserves the captured exact creation reference and current
          // source head; a prior authority snapshot cannot bridge this upload window.
          requireRoleOperation(await service.revalidatePreparedRoleOperation({ ...context.input, snapshot: undefined,
            review: record.review, currentRequest: context.input.request, prepared, fetchDocument, signal }));
          current(); unchanged();
        }).catch(error => { if (reviewed === record) { reviewed = null; generation++; } throw error; }) };
      }).catch(error => {
        if (reviewed === record) { reviewed = null; generation++; }
        if (record.publications.length) {
          error.publications = [...record.publications];
          error.publishedDocuments = record.publications.filter(row => row.cid);
        }
        throw error;
      }).finally(() => { record.preparing = null; });
      return record.preparing;
    },
  };
}
