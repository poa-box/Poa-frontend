/** Learning intents retain the existing host storage, notifications and transaction transport. */
import { ethers } from 'ethers';
import { requireRawUint } from '@poa-box/core/amounts';
import { parseModuleId } from '@poa-box/core/encoding';
import { metadataPointerToBytes32 } from '@poa-box/core/encoding/cid';
import { buildCreateModule, buildCompleteModule, buildUpdateModule } from '@poa-box/core/tx/education';
import { buildEducationModuleMetadata, serializeEducationModuleMetadata } from '@poa-box/core/metadata/education';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { requireAddress, requireString } from '@/services/web3/utils/validation';
import { moduleRewardRaw } from '@/lib/tasks/educationForm';

function scopedModuleId(address, id) {
  if (typeof id === 'number' && !Number.isSafeInteger(id)) {
    throw new Error('Module ID must be an exact integer string');
  }
  const raw = String(id);
  if (raw.includes('-') && (raw.split('-').length !== 2 || raw.split('-')[0].toLowerCase() !== address.toLowerCase())) {
    throw new Error('Module ID belongs to a different EducationHub');
  }
  return requireRawUint(parseModuleId(raw));
}

export class EducationService {
  constructor(contractFactory, transactionManager, ipfsService = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.ipfs = ipfsService;
  }

  async createModule(contractAddress, moduleData, options = {}) {
    options.assertCurrent?.();
    requireAddress(contractAddress, 'EducationHub contract address');
    requireString(moduleData.name, 'Module name');
    moduleRewardRaw(moduleData.payout);
    const input = { educationHubAddress: contractAddress, name: moduleData.name,
      contentHash: ethers.constants.HashZero, payout: moduleData.payout,
      correctAnswer: Number(moduleData.correctAnswers?.[0]),
    };
    buildCreateModule(input); // Validate before storage I/O.
    let contentHash = ethers.constants.HashZero;
    if (this.ipfs) {
      const metadata = buildEducationModuleMetadata(moduleData);
      const result = await this.ipfs.addToIpfs(serializeEducationModuleMetadata(metadata));
      contentHash = metadataPointerToBytes32(result.path);
    }
    options.assertCurrent?.();
    return executeCoreIntent(this.factory, this.txManager, buildCreateModule({ ...input, contentHash }), options);
  }

  async completeModule(contractAddress, moduleId, answers, options = {}) {
    options.assertCurrent?.();
    requireAddress(contractAddress, 'EducationHub contract address');
    return executeCoreIntent(this.factory, this.txManager, buildCompleteModule({
      educationHubAddress: contractAddress, moduleId: scopedModuleId(contractAddress, moduleId),
      answer: Number(answers?.[0]),
    }), options);
  }

  /** Prepared full replacement: payoutWei is raw, contentHash is the verified current/new pointer.
   * Answer identity remains immutable. Read/merge orchestration belongs to the library host.
   */
  async updateModule(contractAddress, moduleId, moduleData, options = {}) {
    requireAddress(contractAddress, 'EducationHub contract address');
    requireString(moduleData.name, 'Module name');
    const payout = ethers.BigNumber.isBigNumber(moduleData.payoutWei)
      ? moduleData.payoutWei.toString() : moduleData.payoutWei;
    return executeCoreIntent(this.factory, this.txManager, buildUpdateModule({
      educationHubAddress: contractAddress, moduleId: scopedModuleId(contractAddress, moduleId),
      name: moduleData.name, contentHash: metadataPointerToBytes32(moduleData.contentHash),
      payoutWei: requireRawUint(payout),
    }), options);
  }
}

export function createEducationService(factory, txManager, ipfsService = null) {
  return new EducationService(factory, txManager, ipfsService);
}
