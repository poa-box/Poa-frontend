/** Portable host workflow on published core. All I/O, persistence and presentation are ports.
 * No React, browser globals, application imports, wallet selection or protocol planner lives here. */
const clone = value => structuredClone(value);
const key = value => JSON.stringify(value);
const ready = operation => {
  if (operation?.status === 'ready') return operation.data;
  throw Object.assign(new Error('Current role settings could not be verified. Refresh and review them again.'),
    { code: 'ROLE_OPERATION_UNAVAILABLE', result: operation });
};
const active = signal => { if (signal?.aborted) throw Object.assign(new Error('Role review cancelled.'), { name: 'AbortError' }); };
const terminal = status => ['created', 'executed', 'failed', 'rejected'].includes(status);
export function roleCreationReference(stage) {
  const submission = stage.submission;
  return { transactionHash: stage.transactionHash, ...(stage.proposalId ? { proposalId: stage.proposalId } : {}),
    ...(stage.batch ? { batch: stage.batch } : { call: stage.call }),
    ...(submission && submission.kind !== 'transaction' ? { operation: {
      userOpHash: submission.computedHash, sender: submission.sender || submission.accountAddress,
      nonce: submission.nonce, entryPoint: submission.entryPoint,
    } } : {}), ...(stage.executionOperation ? { executionOperation: stage.executionOperation } : {}) };
}

export function createRoleCreationWorkflow({ operations, observe, store, submission, propose,
  project = (_draft, operation) => operation, proposalId = () => undefined, fetchDocument, uploadDocument, identity,
  assertCurrent = () => {}, canReview = true, changed = () => {}, newId = () => globalThis.crypto.randomUUID() }) {
  let disposed = false, generation = 0, reviewed, submitting, capability;
  const controllers = new Set();
  const current = () => { if (disposed) throw new Error('The organization or account changed. Review the role again.'); assertCurrent(); };
  const work = async (signal, run) => {
    const controller = new AbortController(), cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    controllers.add(controller);
    const check = () => { active(controller.signal); current(); };
    try { check(); return await run(controller.signal, check); }
    finally { signal?.removeEventListener('abort', cancel); controllers.delete(controller); }
  };
  const write = run => submission.withLease(async () => { const value = await run(); changed(); return value; }, capability);
  const update = (id, field, attemptId, patch, expectedSubmission, replacement = false, guard = () => {}) => write(() => {
    guard();
    const row = store.read().find(value => value.id === id);
    if (!row || row[field]?.attemptId !== attemptId) throw new Error('The saved vote changed. Reopen its status.');
    const previous = row[field], next = { ...previous, ...patch };
    const matches = saved => !previous.submission || saved && sameAttempt(previous.submission, saved)
      && previous.submission.recovery.revision <= saved.recovery.revision;
    if (expectedSubmission && !matches(expectedSubmission)
      || patch.submission && !replacement && !matches(patch.submission)) throw new Error('The saved vote identity changed. Reopen its status.');
    if ((terminal(previous.status) && !(previous.transportOutcome === 'not-submitted' && patch.submissionHistory)
      || previous.transportOutcome === 'succeeded' && next.status === 'uncertain') && ['submitting', 'uncertain', 'pending'].includes(next.status)) next.status = previous.status;
    return store.save({ ...row, [field]: next });
  });
  const recover = (id, { signal, candidateTxHash, configurationTxHash } = {}) => work(signal, async (signal, check) => {
    let row = store.read().find(value => value.id === id);
    if (!row) throw new Error('This saved role is unavailable for the current account and organization.');
    if (!row.creation) return { ...row, proof: { state: 'preparing' } };
    const persist = async (field, patch) => { check(); row = await update(id, field, row[field].attemptId, patch, row[field].submission, false, check); return row[field]; };
    const recoverStage = async field => {
      let stage = row[field];
      if (stage.recoveryInvalid) throw new Error('The saved vote identity does not match this request. No new vote was sent.');
      if (['not-submitted', 'failed', 'replaced'].includes(stage.transportOutcome)
        || stage.transactionHash && (!stage.submission || stage.transportOutcome === 'succeeded')) return stage;
      let saved = stage.submission, matchesPending = false;
      const pending = submission.pending();
      if (pending) {
        let candidate;
        try { candidate = identity(pending, stage.expectedIntentKey); } catch { /* Unrelated account action. */ }
        if (candidate && (!saved || sameAttempt(candidate, saved) && candidate.recovery.revision >= saved.recovery.revision)) {
          saved = candidate; matchesPending = true;
        }
      }
      if (!saved) throw new Error('The earlier submission is still unconfirmed. Check its status in your account before trying again.');
      // This copy survives account recovery, a cleared journal, and closing the view.
      await persist(field, { submission: saved });
      const result = await submission.recover(saved, { detached: !matchesPending, onOutcome: () => check(),
        candidateTxHash: field === 'creation' ? candidateTxHash : configurationTxHash });
      check();
      const transactionHash = result.receipt?.transactionHash || result.outcome?.txHash;
      stage = await persist(field, {
        ...(isHash(transactionHash) ? { transactionHash } : {}),
        ...(['succeeded', 'failed', 'replaced'].includes(result.outcome?.status) ? { transportOutcome: result.outcome.status } : {}),
        ...(result.outcome?.status === 'aborted' ? { transportOutcome: 'not-submitted' } : {}),
        ...(['failed', 'replaced', 'aborted'].includes(result.outcome?.status) ? { status: 'failed', failureKind: 'submission' } : {}),
      });
      check();
      if (!['succeeded', 'failed', 'replaced', 'aborted'].includes(result.outcome?.status)
        || !stage.transactionHash && stage.status !== 'failed') throw new Error('The earlier submission is still unconfirmed. No new vote was sent.');
      return stage;
    };
    let creation = await recoverStage('creation');
    if (['not-submitted', 'failed', 'replaced'].includes(creation.transportOutcome)) return { ...row, proof: { state: 'failed' } };
    const context = await observe({ signal }); check();
    const result = await operations.status({ ...context, creation: roleCreationReference(creation), signal }); check();
    if (result.status !== 'ready' && result.observations?.creation?.state === 'known') {
      const partial = result.observations.creation.value;
      await persist('creation', { status: partial.state, proposalId: partial.proposalId, transactionHash: partial.creationTransactionHash });
    }
    const proof = ready(result).creation;
    creation = await persist('creation', { status: proof.state, proposalId: proof.proposalId,
      transactionHash: proof.creationTransactionHash, ...(proof.state === 'failed' ? { failureKind: 'execution' } : {}) });
    if (row.configuration) {
      const configuration = await recoverStage('configuration');
      if (!['not-submitted', 'failed', 'replaced'].includes(configuration.transportOutcome)) {
        const status = await operations.status({ ...context, creation: roleCreationReference(creation),
          configuration: roleCreationReference(configuration), fetchDocument, signal }); check();
        const outcome = ready(status).configuration;
        if (!outcome) throw new Error('The saved configuration status is unavailable. Try again.');
        await persist('configuration', { status: outcome.state, proposalId: outcome.proposalId,
          transactionHash: outcome.creationTransactionHash, ...(outcome.state === 'failed' ? { failureKind: 'execution' } : {}) });
      }
    }
    return { ...row, proof, snapshot: context.snapshot };
  });
  const describe = async (input, signal, check) => {
    const continuation = input.continuationId ? await recover(input.continuationId, { signal }) : null; check();
    if (continuation && (continuation.proof.state !== 'created'
      || continuation.configuration && !['failed', 'rejected'].includes(continuation.configuration.status))) {
      throw new Error('Your earlier vote is still waiting or needs attention. Check the saved vote in Votes before submitting another.');
    }
    const context = await observe({ signal }); check();
    return { ...context, request: { ...input.request, ...(continuation ? { mode: 'existing',
      subjectId: continuation.proof.subjectId, continuation: roleCreationReference(continuation.creation) } : {}) } };
  };
  const prepare = async (record, signal, check, publish) => {
    const unchanged = () => { check(); if (reviewed !== record) throw new Error('The role changed. Review it again.'); };
    const context = await describe(record.input, signal, unchanged); unchanged();
    const publishDocument = async (document, { signal } = {}) => {
      active(signal); unchanged();
      const result = await publish(document);
      active(signal); unchanged();
      return result;
    };
    const operation = await operations.prepare({ ...context, review: record.review, currentRequest: context.request,
      fetchDocument, publishDocument, signal }); unchanged();
    const prepared = ready(operation);
    const built = project(record.input.draft, operation, record.review, false);
    if (built.submittable && !built.submittable.ok) throw new Error(built.submittable.message);
    for (const call of built.batch || []) Object.freeze(call);
    if (built.batch) Object.freeze(built.batch);
    const revalidate = () => work(undefined, async (signal, check) => {
      unchanged();
      ready(await operations.revalidate({ ...context, snapshot: undefined, review: record.review,
        currentRequest: context.request, prepared, fetchDocument, signal })); check(); unchanged();
    }).catch(error => { if (reviewed === record) { reviewed = null; generation++; } throw error; });
    return { prepared, built, revalidate };
  };
  return {
    activate() { disposed = false; },
    dispose() { disposed = true; generation++; reviewed = null; for (const controller of controllers) controller.abort(); },
    rows: () => store.read().filter(row => row.mode !== 'compound'), recover,
    capabilities: ({ signal } = {}) => work(signal, async (signal, check) => {
      const context = await observe({ signal }); check();
      const result = await operations.read({ ...context, purpose: 'capabilities', signal }); check();
      ready(result); return { ...result, contracts: context.scope.contracts };
    }),
    review(input, { signal } = {}) {
      if (!canReview) return Promise.reject(new Error('Current role settings could not be verified.'));
      input = clone(input);
      const version = ++generation; reviewed = null;
      return work(signal, async (signal, check) => {
        const context = await describe(input, signal, check);
        const operation = await operations.review({ ...context, fetchDocument, signal }); check();
        const review = ready(operation);
        if (version !== generation) throw new Error('The role changed. Review it again.');
        reviewed = { input, key: key(input), review, publications: [] };
        return project(input.draft, operation, review, true);
      });
    },
    submit(input, proposal, { signal, onSaved } = {}) {
      if (!canReview) return Promise.reject(new Error('Review the current role configuration before creating this vote.'));
      input = clone(input); proposal = clone(proposal);
      const record = reviewed, submissionKey = key([input, proposal]);
      if (submitting) return submitting.key === submissionKey ? submitting.promise : Promise.reject(new Error('Another role vote is being submitted.'));
      if (!record || record.key !== key(input)) return Promise.reject(new Error('Review the current role configuration before creating this vote.'));
      const promise = work(signal, (signal, check) => submission.session(async lease => {
        capability = lease; check();
        let id, field, attemptId = newId(), lastSubmission;
        const rows = store.read(), existing = rows.find(row => row.id === input.continuationId);
        const duplicate = rows.find(row => (row.draftKey === input.draftKey && input.draftKey || key(row.form) === key(input.draft))
          && !['failed', 'rejected'].includes(row.creation?.status));
        if (!existing && duplicate?.creation) throw new Error('This role already has a saved vote. Check it in Votes before continuing.');
        let savedRow = existing || duplicate;
        id = savedRow?.id || newId();
        savedRow = await write(() => store.save({ ...(savedRow || { id, originalForm: clone(input.draft) }),
          form: input.draft, draftKey: input.draftKey, mode: savedRow?.mode || record.review.mode,
          requiresConfiguration: savedRow?.requiresConfiguration ?? record.review.requiresConfiguration,
          publications: savedRow?.publications || [], proposalCreatedAt: savedRow?.proposalCreatedAt ?? Date.now(), publicationAttempt: attemptId }));
        // Publication intentions and exact bytes survive close/reload, including lost upload responses.
        const publishDocument = async document => {
          check();
          const row = store.read().find(row => row.id === id);
          if (!row || row.publicationAttempt !== attemptId) throw new Error('The saved draft changed. Review it again.');
          const prior = row.publications.find(item => item.key === document.key && item.digest === document.digest && item.json === document.json);
          if (prior) {
            if (prior.status !== 'published' || !prior.cid) throw new Error('The earlier details could not be confirmed as saved. No repeat upload was made.');
            return { cid: prior.cid };
          }
          const entry = { ...document, status: 'unknown' };
          record.publications.push(entry);
          await write(() => store.save({ ...row, publications: [...row.publications, entry] }));
          check();
          const uploaded = await uploadDocument(document.json);
          const cid = typeof uploaded === 'string' ? uploaded : uploaded?.path;
          if (!cid) throw new Error('The role details could not be confirmed as saved.');
          const latest = store.read().find(row => row.id === id);
          if (!latest || latest.publicationAttempt !== attemptId) throw new Error('The saved draft changed.');
          Object.assign(entry, { cid, status: 'published' });
          await write(() => store.save({ ...latest, publications: latest.publications.map(item => item.key === entry.key && item.digest === entry.digest && item.json === entry.json ? entry : item) }));
          check(); return { cid };
        };
        const { prepared, built, revalidate } = await prepare(record, signal, check, publishDocument);
        const mode = prepared.mode;
        const complete = async result => {
          if (!field) return;
          const transactionHash = result?.receipt?.transactionHash || result?.txHash || result?.outcome?.txHash;
          const idFromReceipt = proposalId(result?.receipt);
          const success = result?.success || result?.outcome?.status === 'succeeded';
          const failed = result?.submissionState === 'not-submitted' || ['failed', 'replaced'].includes(result?.outcome?.status);
          await update(id, field, attemptId, { status: success && isHash(transactionHash) ? 'pending' : failed ? 'failed' : 'uncertain',
            ...(failed ? { failureKind: 'submission', transportOutcome: result?.outcome?.status || 'not-submitted' } : {}),
            ...(success && isHash(transactionHash) ? { transportOutcome: 'succeeded' } : {}),
            ...(isHash(transactionHash) ? { transactionHash } : {}),
            ...(idFromReceipt ? { proposalId: idFromReceipt } : {}) });
        };
        const result = await propose(built, { ...proposal, createdAt: proposal.createdAt ?? savedRow.proposalCreatedAt }, {
          beforeExecute: revalidate, lease, publishDocument,
          onIntent: async (intentKey, lease) => {
            check(); capability = lease;
            await write(() => {
              check();
              const existing = store.read().find(row => row.id === id);
              if (!existing || existing.publicationAttempt !== attemptId) throw new Error('The saved draft changed. Review it again.');
              if (mode === 'existing' && existing.configuration && !['failed', 'rejected'].includes(existing.configuration.status)) {
                throw new Error('This configuration already has a saved submission. Check its status before trying again.');
              }
              field = mode === 'existing' ? 'configuration' : 'creation';
              const stage = { status: 'submitting', attemptId, expectedIntentKey: intentKey, transportStarted: true,
                ...(mode === 'existing' ? { batch: prepared.batch } : { call: prepared.batch[0] }) };
              store.save(mode !== 'existing' ? { ...existing, requiresConfiguration: prepared.requiresConfiguration, creation: stage }
                : { ...existing, form: input.draft, configurationHistory: [...(existing.configurationHistory || []), ...(existing.configuration ? [existing.configuration] : [])], configuration: stage });
            });
            if (mode !== 'compound') await onSaved?.(id); check();
          },
          onRecoveryRecord: async raw => {
            if (!field) return;
            const row = store.read().find(row => row.id === id), stage = row?.[field];
            if (!stage || stage.attemptId !== attemptId) throw new Error('The saved vote changed. Reopen its status.');
            const saved = identity(raw, stage.expectedIntentKey);
            if (lastSubmission && sameAttempt(lastSubmission, saved) && saved.recovery.revision < lastSubmission.recovery.revision) throw new Error('The saved vote identity changed.');
            const history = [...(stage.submissionHistory || []), ...(lastSubmission && !sameAttempt(lastSubmission, saved) ? [lastSubmission] : [])];
            await update(id, field, attemptId, { submission: saved, ...(history.length ? { submissionHistory: history, transportOutcome: undefined, failureKind: undefined, status: 'submitting' } : {}) }, undefined, Boolean(lastSubmission && !sameAttempt(lastSubmission, saved)));
            lastSubmission = saved;
          },
          onOutcome: complete,
        });
        return { ...result, role: built, ...(mode !== 'compound' ? { continuationId: id } : {}) };
      })).catch(error => {
        if (reviewed === record) { reviewed = null; generation++; }
        if (record.publications.length) {
          error.publications = [...record.publications]; error.publishedDocuments = record.publications.filter(row => row.cid).map(({ key, digest, cid }) => ({ key, digest, cid }));
        }
        throw error;
      }).finally(() => { submitting = null; capability = null; });
      submitting = { key: submissionKey, promise }; return promise;
    },
  };
}
const isHash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const sameAttempt = (a, b) => a.recovery.attemptId === b.recovery.attemptId && a.recovery.ownerId === b.recovery.ownerId
  && key(a.recovery.scope) === key(b.recovery.scope);
