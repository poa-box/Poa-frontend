/** Task/project intents executed through the existing host transport and storage. */
import { ethers } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { parseProjectId } from '@poa-box/core/encoding';
import { parseDecimalAmountToRaw } from '@poa-box/core/amounts';
import { metadataPointerToBytes32 } from '@poa-box/core/encoding/cid';
import { taskEntityId } from '@poa-box/core/reads/task';
import { buildCreateProjectRaw, buildDeleteProject } from '@poa-box/core/tx/project';
import {
  buildCreateTaskRaw, buildCreateTasksBatchRaw, buildCreateAndAssignTaskRaw,
  buildClaimTask, buildUnclaimTask, buildSubmitTask, buildCompleteTask,
  buildRejectTask, buildCancelTask, buildApplyForTask, buildApproveApplication,
  buildAssignTask, buildUpdateTask, buildUpdateTaskMetadata, buildSetFolders,
  taskConfigCall,
} from '@poa-box/core/tx/task';
import {
  buildTaskApplicationMetadata, serializeTaskApplicationMetadata,
} from '@poa-box/core/metadata/task';
import {
  getProjectBudget, getBountyBudget, getFoldersRoot, getOrganizerHats,
} from '@poa-box/core/task-lens';
import { encodeIntent } from '@poa-box/core/tx/intent';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { requireAddress, requireString } from '@/services/web3/utils/validation';
import { getTokenByAddress } from '@/util/tokens';
import { createTaskMetadata, editTaskMetadata } from '@/lib/tasks/metadata';
import { serializeTaskMetadata } from '@poa-box/core/metadata/task';
import { memberTaskError } from '@/lib/tasks/hostScope';

const ZERO = ethers.constants.HashZero;
const NO_BOUNTY = ethers.constants.AddressZero;
const TaskManagerABI = getAbi('TaskManagerNew');
const lensInterface = new ethers.utils.Interface(TaskManagerABI);

/** Storage concurrency and row ordering are host policies. */
async function mapWithConcurrency(items, mapper, limit) {
  const results = new Array(items.length);
  let nextIdx = 0;
  const worker = async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

// The public service accepts human amounts. Convert once for raw update/assignment APIs.
function humanRaw(value, decimals = 18) {
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
    throw new Error('Enter the amount as an exact decimal string.');
  }
  return parseDecimalAmountToRaw(String(value), decimals);
}

function rawInput(value) {
  return ethers.BigNumber.isBigNumber(value) ? value.toString() : value;
}

function bountyRaw(data) {
  const token = data.bountyToken || NO_BOUNTY;
  if (token.toLowerCase() === NO_BOUNTY || !data.bountyPayout) return '0';
  const configured = getTokenByAddress(token);
  const decimals = data.bountyDecimals ?? (configured.symbol === 'ERC20' ? undefined : configured.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw memberTaskError('The reward currency details are unavailable. Reload the task and try again.');
  }
  return humanRaw(data.bountyPayout, decimals);
}

function deadlineInput(value) {
  if (value == null) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Enter a valid deadline in whole seconds.');
  return parsed;
}

function scopedProjectId(address, id) {
  if (typeof id === 'string' && id.includes('-') && /^0x[\da-f]{40}-/i.test(id)
      && id.split('-')[0].toLowerCase() !== address.toLowerCase()) {
    throw new Error('Project ID belongs to a different TaskManager');
  }
  return parseProjectId(id);
}

function taskArgs(address, taskId) {
  requireAddress(address, 'TaskManager contract address');
  // Canonical validation rejects unsafe numeric IDs and foreign entity IDs before any I/O.
  return { taskManagerAddress: address, taskId: taskEntityId(address, taskId) };
}

function createArgs(address, taskData, metadataHash) {
  requireAddress(address, 'TaskManager contract address');
  requireString(taskData.name, 'Task name');
  return {
    taskManagerAddress: address,
    payoutRaw: humanRaw(taskData.payout), title: taskData.name, metadataHash,
    projectId: scopedProjectId(address, taskData.projectId),
    bountyToken: taskData.bountyToken || NO_BOUNTY,
    bountyPayoutRaw: bountyRaw(taskData),
    requiresApplication: taskData.requiresApplication ?? false,
    absoluteDeadline: deadlineInput(taskData.absoluteDeadline),
    completionWindow: deadlineInput(taskData.completionWindow),
    features: { deadlines: true },
  };
}

function creationEvidence(args, metadataHash) {
  return { projectId: args.projectId, title: args.title, metadataHash,
    payoutRaw: args.payoutRaw, bountyToken: args.bountyToken,
    bountyPayoutRaw: args.bountyPayoutRaw, requiresApplication: args.requiresApplication };
}

export class TaskService {
  constructor(contractFactory, transactionManager, ipfsService = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.ipfs = ipfsService;
  }

  execute(intent, options = {}) {
    options.assertCurrent?.();
    return executeCoreIntent(this.factory, this.txManager, intent, options);
  }

  async pinTask(document) {
    if (!this.ipfs) return ZERO;
    const result = await this.ipfs.addToIpfs(serializeTaskMetadata(document));
    return metadataPointerToBytes32(result.path);
  }

  prepareCreateProject(contractAddress, projectData) {
    requireAddress(contractAddress, 'TaskManager contract address');
    requireString(projectData.name, 'Project name');
    if (['createHats', 'claimHats', 'reviewHats', 'assignHats'].some(key => projectData[key]?.length)) {
      throw new Error('Project role permissions must be configured through the membership authority.');
    }
    return buildCreateProjectRaw({
      ...projectData, taskManagerAddress: contractAddress,
      metadataHash: projectData.metadataHash === ZERO ? '' : projectData.metadataHash,
      capRaw: rawInput(projectData.cap ?? 0),
      bountyCapsRaw: (projectData.bountyCaps ?? []).map(rawInput),
    });
  }

  async createProject(contractAddress, projectData, options = {}) {
    return this.execute(this.prepareCreateProject(contractAddress, projectData), options);
  }

  async deleteProject(contractAddress, projectId, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    return this.execute(buildDeleteProject({
      taskManagerAddress: contractAddress, projectId: scopedProjectId(contractAddress, projectId),
    }), { ...options, isDelete: true });
  }

  async createTask(contractAddress, taskData, options = {}) {
    options.assertCurrent?.();
    const args = createArgs(contractAddress, taskData, ZERO);
    // Validate the same named raw input before storage; explicit zero means no stored metadata.
    encodeIntent(buildCreateTaskRaw(args));
    const document = createTaskMetadata(taskData);
    const metadataHash = await this.pinTask(document);
    options.assertCurrent?.();
    const intent = buildCreateTaskRaw({ ...args, metadataHash });
    options.onPreparedCreation?.({ taskManagerAddress: contractAddress,
      creations: [creationEvidence(args, metadataHash)] });
    return this.execute(intent, options);
  }

  async createTasksBatch(contractAddress, projectId, tasks, options = {}) {
    options.assertCurrent?.();
    requireAddress(contractAddress, 'TaskManager contract address');
    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('createTasksBatch: tasks[] must be a non-empty array');
    }
    const pid = scopedProjectId(contractAddress, projectId);
    const rows = tasks.map(task => createArgs(contractAddress, { ...task, projectId: pid }, ZERO));
    const documents = tasks.map(createTaskMetadata);
    const intent = buildCreateTasksBatchRaw({ taskManagerAddress: contractAddress, projectId: pid, tasks: rows });
    encodeIntent(intent);
    const hashes = await mapWithConcurrency(documents, document => { options.assertCurrent?.(); return this.pinTask(document); }, 5);
    options.assertCurrent?.();
    options.onPreparedCreation?.({ taskManagerAddress: contractAddress,
      creations: rows.map((row, i) => creationEvidence(row, hashes[i])) });
    return this.execute(buildCreateTasksBatchRaw({ taskManagerAddress: contractAddress, projectId: pid,
      tasks: rows.map((row, i) => ({ ...row, metadataHash: hashes[i] })),
    }), options);
  }

  async claimTask(contractAddress, taskId, options = {}) {
    return this.execute(buildClaimTask(taskArgs(contractAddress, taskId)), options);
  }

  /** The contract permits self-release without CLAIM; third-party release requires expiry/ASSIGN. */
  async unclaimTask(contractAddress, taskId, options = {}) {
    return this.execute(buildUnclaimTask(taskArgs(contractAddress, taskId)), options);
  }

  async submitTask(contractAddress, taskId, submissionCid, options = {}) {
    return this.execute(buildSubmitTask({ ...taskArgs(contractAddress, taskId),
      submissionHash: metadataPointerToBytes32(submissionCid) }), options);
  }

  async completeTask(contractAddress, taskId, options = {}) {
    return this.execute(buildCompleteTask(taskArgs(contractAddress, taskId)), options);
  }

  async rejectTask(contractAddress, taskId, rejectionCid, options = {}) {
    return this.execute(buildRejectTask({ ...taskArgs(contractAddress, taskId),
      rejectionHash: metadataPointerToBytes32(rejectionCid) }), options);
  }

  async updateTask(contractAddress, taskId, updateData, options = {}) {
    const args = taskArgs(contractAddress, taskId);
    requireString(updateData.name, 'Task name');
    if (typeof updateData.metadataHash !== 'string' || !updateData.metadataHash.trim()) {
      throw memberTaskError('The saved task details are required before updating. Reload the task and try again.');
    }
    return this.execute(buildUpdateTask({ ...args,
      title: updateData.name,
      payoutWei: humanRaw(updateData.payout),
      metadataHash: updateData.metadataHash === ZERO ? ZERO : metadataPointerToBytes32(updateData.metadataHash),
      bountyToken: updateData.bountyToken || NO_BOUNTY,
      bountyPayoutWei: bountyRaw(updateData),
      absoluteDeadline: deadlineInput(updateData.absoluteDeadline),
      completionWindow: deadlineInput(updateData.completionWindow),
    }), options);
  }

  /** Pass baseMetadata (the complete verified document) to retain submission and extension fields. */
  async editTask(contractAddress, taskId, taskData, options = {}) {
    if (!this.ipfs) throw memberTaskError('Task details could not be saved. Reload the task and try again.');
    const args = taskArgs(contractAddress, taskId);
    requireString(taskData.name, 'Task name');
    const input = { ...args,
      title: taskData.name, payoutWei: humanRaw(taskData.payout), metadataHash: ZERO,
      bountyToken: taskData.bountyToken || NO_BOUNTY, bountyPayoutWei: bountyRaw(taskData),
      absoluteDeadline: deadlineInput(taskData.absoluteDeadline),
      completionWindow: deadlineInput(taskData.completionWindow),
    };
    encodeIntent(buildUpdateTask(input));
    options.assertCurrent?.();
    const metadataHash = await this.pinTask(editTaskMetadata(taskData));
    return this.execute(buildUpdateTask({ ...input, metadataHash }), options);
  }

  async editTaskMetadata(contractAddress, taskId, metadata, options = {}) {
    if (!this.ipfs) throw memberTaskError('Task details could not be saved. Reload the task and try again.');
    const args = taskArgs(contractAddress, taskId);
    requireString(metadata.name, 'Task name');
    const input = { ...args, title: metadata.name, metadataHash: ZERO };
    encodeIntent(buildUpdateTaskMetadata(input));
    options.assertCurrent?.();
    const metadataHash = await this.pinTask(editTaskMetadata(metadata));
    return this.execute(buildUpdateTaskMetadata({ ...input, metadataHash }), options);
  }

  async cancelTask(contractAddress, taskId, options = {}) {
    return this.execute(buildCancelTask(taskArgs(contractAddress, taskId)), { ...options, isDelete: true });
  }

  async applyForTask(contractAddress, taskId, applicationData, options = {}) {
    const args = taskArgs(contractAddress, taskId);
    let applicationHash = ZERO;
    if (this.ipfs && applicationData) {
      const metadata = { ...buildTaskApplicationMetadata(applicationData), ...applicationData };
      const result = await this.ipfs.addToIpfs(serializeTaskApplicationMetadata(metadata));
      applicationHash = metadataPointerToBytes32(result.path);
    }
    return this.execute(buildApplyForTask({ ...args, applicationHash }), options);
  }

  async approveApplication(contractAddress, taskId, applicantAddress, options = {}) {
    requireAddress(applicantAddress, 'Applicant address');
    return this.execute(buildApproveApplication({ ...taskArgs(contractAddress, taskId), applicant: applicantAddress }), options);
  }

  async assignTask(contractAddress, taskId, assigneeAddress, options = {}) {
    requireAddress(assigneeAddress, 'Assignee address');
    return this.execute(buildAssignTask({ ...taskArgs(contractAddress, taskId), assignee: assigneeAddress }), options);
  }

  async setProjectCap(contractAddress, projectId, newCapWei, options = {}) {
    return this.execute(taskConfigCall(contractAddress, {
      key: 'PROJECT_CAP', projectId: scopedProjectId(contractAddress, projectId), capRaw: rawInput(newCapWei),
    }), options);
  }

  async setBountyCap(contractAddress, projectId, tokenAddress, newCapWei, options = {}) {
    return this.execute(taskConfigCall(contractAddress, {
      key: 'BOUNTY_CAP', projectId: scopedProjectId(contractAddress, projectId), token: tokenAddress, capRaw: rawInput(newCapWei),
    }), options);
  }

  async setFolders(contractAddress, expectedCurrentRoot, newRoot, options = {}) {
    requireAddress(contractAddress, 'TaskManager contract address');
    return this.execute(buildSetFolders({ taskManagerAddress: contractAddress, expectedCurrentRoot, newRoot }), options);
  }

  async setOrganizerHatAllowed(contractAddress, hatId, allowed, options = {}) {
    return this.execute(taskConfigCall(contractAddress, {
      key: 'ORGANIZER_HAT_ALLOWED', subjectId: rawInput(hatId), enabled: Boolean(allowed),
    }), options);
  }

  /** Adapt the existing read-only contract transport to core's provider.call seam.
   * Core supplies every selector/parameter/decoder; the full host ABI still parses errors.
   */
  lensProvider(contractAddress) {
    requireAddress(contractAddress, 'TaskManager contract address');
    const contract = this.factory.createReadOnly(contractAddress, TaskManagerABI);
    return { call: async ({ data }) => {
      const [key, params] = lensInterface.decodeFunctionData('getLensData', data);
      const raw = await contract.getLensData(key, params);
      return lensInterface.encodeFunctionResult('getLensData', [raw]);
    } };
  }

  async readProjectBudget(contractAddress, projectId) {
    return getProjectBudget(this.lensProvider(contractAddress), contractAddress,
      scopedProjectId(contractAddress, projectId));
  }

  async readBountyBudget(contractAddress, projectId, tokenAddress) {
    requireAddress(tokenAddress, 'Bounty token address');
    return getBountyBudget(this.lensProvider(contractAddress), contractAddress,
      scopedProjectId(contractAddress, projectId), tokenAddress);
  }

  async readFoldersRoot(contractAddress) {
    return getFoldersRoot(this.lensProvider(contractAddress), contractAddress);
  }

  async readOrganizerHatIds(contractAddress) {
    const ids = await getOrganizerHats(this.lensProvider(contractAddress), contractAddress);
    return ids.map(id => id.toString());
  }

  async createAndAssignTask(contractAddress, taskData, assigneeAddress, options = {}) {
    options.assertCurrent?.();
    requireAddress(assigneeAddress, 'Assignee address');
    const args = createArgs(contractAddress, taskData, ZERO);
    const document = createTaskMetadata(taskData);
    const rawArgs = { ...args, assignee: assigneeAddress };
    encodeIntent(buildCreateAndAssignTaskRaw(rawArgs));
    const metadataHash = await this.pinTask(document);
    options.assertCurrent?.();
    options.onPreparedCreation?.({ taskManagerAddress: contractAddress, creations: [creationEvidence(args, metadataHash)] });
    return this.execute(buildCreateAndAssignTaskRaw({ ...rawArgs, metadataHash }), options);
  }
}

export function createTaskService(factory, txManager, ipfsService = null) {
  return new TaskService(factory, txManager, ipfsService);
}
