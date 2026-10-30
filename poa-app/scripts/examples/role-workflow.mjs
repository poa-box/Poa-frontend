/** DOM-free consumer of the frontend's portable host workflow, not a new package API. */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readRoleOperationEvidence, reviewRoleOperation, prepareRoleOperation,
  revalidatePreparedRoleOperation, readRoleOperationStatus } from '@poa-box/core/governance/role-operations';
import { createRoleCreationWorkflow } from '../../src/services/web3/domain/RoleCreationWorkflow.js';

export function createRoleHost(ports) {
  return createRoleCreationWorkflow({ ...ports, operations: {
    read: readRoleOperationEvidence, review: reviewRoleOperation, prepare: prepareRoleOperation,
    revalidate: revalidatePreparedRoleOperation, status: readRoleOperationStatus,
  } });
}

// The adapter supplies its source readers, durable store, shared account submission
// controller, proposal envelope/transport and explicit review/approval presentation.
export async function runRoleCommand(ports, { action, input, proposal, id, candidateTxHash, configurationTxHash }) {
  const roles = createRoleHost(ports);
  try {
    if (action === 'recover') return await roles.recover(id, { candidateTxHash, configurationTxHash });
    const review = await roles.review(input);
    if (action === 'review') return review;
    if (action !== 'submit' || await ports.approve(review, proposal) !== true) throw new Error('Explicit approval is required.');
    return await roles.submit(input, proposal);
  } finally { roles.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [adapterPath, requestPath] = process.argv.slice(2);
  if (!adapterPath || !requestPath) {
    console.log('Usage: node scripts/examples/role-workflow.mjs ./adapter.mjs ./request.json');
  } else {
    const { default: ports } = await import(pathToFileURL(resolve(adapterPath)).href);
    const request = JSON.parse(await readFile(requestPath, 'utf8'));
    console.log(JSON.stringify(await runRoleCommand(ports, request), (_, value) => typeof value === 'bigint' ? String(value) : value, 2));
  }
}
