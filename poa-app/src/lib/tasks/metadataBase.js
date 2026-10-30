import { metadataPointerToBytes32 } from '@poa-box/core/encoding/cid';
import { requireTaskMetadataFinal } from '@poa-box/core/metadata/task';
import { taskEntityId } from '@poa-box/core/reads/task';
import { editTaskMetadata } from '@/lib/tasks/metadata';
import { assertTaskHostScope, assertCurrentTask, taskHostScopeKey, taskMetadataIdentity, memberTaskError } from '@/lib/tasks/hostScope';

const unavailable = () => memberTaskError('The saved task details are unavailable. Reload the task and try again.');

/** Read complete documents through the existing verified storage transport, never indexed subsets. */
export function createTaskMetadataStore() {
  const documents = new Map();
  return {
    clear: () => documents.clear(),
    async load({ task, scope, currentScope, currentTask, fetchFromIpfs }) {
      const check = () => {
        assertTaskHostScope(currentScope(), scope);
        assertCurrentTask(currentTask(), task);
      };
      check();
      if (!scope.hydrated || !scope.orgId || !scope.projectId || !scope.endpoint
          || taskEntityId(scope.contract, task.id) !== task.id.toLowerCase()
          || task.projectId?.toLowerCase() !== scope.projectId.toLowerCase()) throw unavailable();
      const key = taskHostScopeKey(scope) + taskMetadataIdentity(task);
      if (documents.has(key)) return structuredClone(documents.get(key));
      const pointer = task.metadataHash;
      if (!pointer || /^0x0+$/i.test(pointer) || !fetchFromIpfs) throw unavailable();
      metadataPointerToBytes32(pointer);
      let raw;
      try { raw = await fetchFromIpfs(pointer); } catch { throw unavailable(); }
      check();
      try { requireTaskMetadataFinal(raw); } catch { throw unavailable(); }
      let base = structuredClone(raw);
      // The submission pointer is a second complete document. Preserve its saved
      // work/extensions while retaining the task's current editable fields.
      if (task.submissionHash && !/^0x0+$/i.test(task.submissionHash)
          && task.submissionHash.toLowerCase() !== pointer.toLowerCase()) {
        metadataPointerToBytes32(task.submissionHash);
        let submitted;
        try { submitted = await fetchFromIpfs(task.submissionHash); } catch { throw unavailable(); }
        check();
        try { requireTaskMetadataFinal(submitted); } catch { throw unavailable(); }
        base = editTaskMetadata({ baseMetadata: { ...submitted, ...base }, submission: submitted.submission });
      }
      check();
      documents.set(key, base);
      return structuredClone(base);
    },
  };
}
