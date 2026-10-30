import { gql } from '@apollo/client';
import { FETCH_TASK_SUBMISSION_HISTORY } from '@poa-box/core/graph/documents/task';

// Adapt the canonical immutable-history selection to the host's narrow latest-rejection read.
// The linked submission shape comes from core, and polling/cache ownership stays in Apollo.
const history = gql(FETCH_TASK_SUBMISSION_HISTORY);
const operation = history.definitions[0];
const task = operation.selectionSet.selections[0];
const field = (selectionSet, name) => selectionSet.selections.find(s => s.name.value === name);
const latest = field(task.selectionSet, 'latestRejection');
const rejection = field(task.selectionSet, 'rejections');
const linkedSubmission = field(rejection.selectionSet, 'submission');
export const FETCH_LATEST_REJECTED_SUBMISSION = {
  ...history,
  definitions: [{ ...operation,
    name: { kind: 'Name', value: 'FetchLatestRejectedSubmission' },
    variableDefinitions: operation.variableDefinitions.filter(v => v.variable.name.value === 'taskId'),
    selectionSet: { ...operation.selectionSet, selections: [{ ...task,
      selectionSet: { ...task.selectionSet, selections: [{ ...latest,
        selectionSet: { ...latest.selectionSet, selections: [...latest.selectionSet.selections, linkedSubmission] },
      }] },
    }] },
  }],
};

/** Read the linked immutable submission, preserving missing content as unknown/null. */
export async function fetchLatestRejectedSubmission({ client, taskId, fetchFromIpfs }) {
  if (!client || !taskId) return null;
  const { data } = await client.query({
    query: FETCH_LATEST_REJECTED_SUBMISSION, variables: { taskId }, fetchPolicy: 'network-only',
  });
  const indexedSubmission = data?.task?.latestRejection?.submission;
  if (typeof indexedSubmission?.metadata?.submission === 'string') return indexedSubmission.metadata.submission;
  if (!indexedSubmission?.submissionHash || typeof fetchFromIpfs !== 'function') return null;
  const submissionMetadata = await fetchFromIpfs(indexedSubmission.submissionHash);
  return typeof submissionMetadata?.submission === 'string' ? submissionMetadata.submission : null;
}
