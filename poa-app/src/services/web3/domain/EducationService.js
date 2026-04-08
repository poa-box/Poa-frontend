/**
 * EducationService
 * Handles Education Hub operations for learning modules
 */

import { ethers } from 'ethers';
import EducationHubABI from '../../../../abi/EducationHubNew.json';
import { stringToBytes, ipfsCidToBytes32, parseModuleId } from '../utils/encoding';
import {
  requireAddress,
  requireString,
  requireNonNegativeNumber,
} from '../utils/validation';

/**
 * EducationService - Learning module management
 */
export class EducationService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   * @param {Object} ipfsService - IPFS service for content storage
   */
  constructor(contractFactory, transactionManager, ipfsService = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.ipfs = ipfsService;
  }

  /**
   * Create an education module
   * @param {string} contractAddress - EducationHub contract address
   * @param {Object} moduleData - Module data
   * @param {string} moduleData.name - Module name
   * @param {string} moduleData.description - Module description
   * @param {string} [moduleData.link] - External learning link
   * @param {string[]} moduleData.quiz - Quiz questions
   * @param {string[][]} moduleData.answers - Possible answers for each question
   * @param {number[]} moduleData.correctAnswers - Correct answer indices
   * @param {number} moduleData.payout - Completion payout (human-readable, e.g. 5 = 5 tokens)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async createModule(contractAddress, moduleData, options = {}) {
    requireAddress(contractAddress, 'EducationHub contract address');
    requireString(moduleData.name, 'Module name');
    requireNonNegativeNumber(moduleData.payout, 'Payout');

    const {
      name,
      description = '',
      link = '',
      quiz = [],
      answers = [],
      correctAnswers = [],
      payout,
    } = moduleData;

    // Upload module content to IPFS if service available
    let contentHash = ethers.constants.HashZero;
    if (this.ipfs) {
      const ipfsData = {
        name,
        description,
        link,
        quiz,
        answers,
      };
      const ipfsResult = await this.ipfs.addToIpfs(JSON.stringify(ipfsData));
      contentHash = ipfsCidToBytes32(ipfsResult.path);
    }

    const contract = this.factory.createWritable(contractAddress, EducationHubABI);

    const titleBytes = stringToBytes(name);

    // Convert payout to wei (18 decimals for participation token)
    const payoutWei = ethers.utils.parseUnits(payout.toString(), 18);

    // Contract expects: createModule(bytes title, bytes32 contentHash, uint256 payout, uint8 correctAnswer)
    const correctAnswer = Number(correctAnswers[0]);

    return this.txManager.execute(
      contract,
      'createModule',
      [titleBytes, contentHash, payoutWei, correctAnswer],
      options
    );
  }

  /**
   * Complete a module (submit quiz answer)
   * @param {string} contractAddress - EducationHub contract address
   * @param {string|number} moduleId - Module ID
   * @param {number[]} answers - User's answer indices (first element used)
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async completeModule(contractAddress, moduleId, answers, options = {}) {
    requireAddress(contractAddress, 'EducationHub contract address');

    const contract = this.factory.createWritable(contractAddress, EducationHubABI);
    const parsedModuleId = parseModuleId(moduleId);

    // Contract expects: completeModule(uint256 id, uint8 answer) — single uint8, not an array
    const answer = Number(answers[0]);

    return this.txManager.execute(
      contract,
      'completeModule',
      [parsedModuleId, answer],
      options
    );
  }
}

/**
 * Create an EducationService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @param {Object} [ipfsService] - IPFS service
 * @returns {EducationService}
 */
export function createEducationService(factory, txManager, ipfsService = null) {
  return new EducationService(factory, txManager, ipfsService);
}
