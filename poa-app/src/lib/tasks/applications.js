import { listTaskApplicationsComplete } from '@poa-box/core/reads/task';
import { requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { createApolloProtocolQuery } from '@/lib/graphql/coreQuery';

export const applicationRow = app => ({ ...app, address: app.applicant,
  username: app.applicantUsername || '', notes: app.metadata?.notes ?? null, experience: app.metadata?.experience ?? null });

/** Detail/action demand only. Core proves every page's task, parent, module and block. */
export async function readTaskApplications({ client, source, task }) {
  const snapshot = await listTaskApplicationsComplete({ source, task,
    query: createApolloProtocolQuery({ clientForEndpoint: endpoint => {
      if (endpoint !== source.endpoint) throw new Error('Task source changed.');
      return client;
    } }), pageSize: 250, maxPages: 40 });
  const data = requireCompleteSnapshot(snapshot, { scope: source, indexed: true, snapshot: 'pinned', block: source.block });
  return { snapshot, applicants: data.applications.map(applicationRow) };
}
