/**
 * ZkEmailInvitesService
 * Submits ZK Email role claims to a per-org ZkEmailInvites module.
 *
 * ZkEmailInvites is an OPTIONAL per-org module: only orgs that opted in (on a chain with ZK Email
 * infra wired) have one. Callers must gate on `zkEmailInvitesEnabled` from POContext before using this.
 *
 * The `proof` arg is the `ZkEmailProof` tuple produced by the client-side prover
 * (src/lib/zkemail/prover.js): { pA, pB, pC, pubkeyHash, emailNullifier, domainName }. The claim is
 * permissionless — anyone may submit it for the address bound in-circuit — so it works from a passkey
 * UserOp (gasless) or an EOA tx.
 */

import ZkEmailInvitesABI from '../../../../abi/ZkEmailInvites.json';
import { requireAddress } from '../utils/validation';

export class ZkEmailInvitesService {
  /**
   * @param {ContractFactory} contractFactory
   * @param {TransactionManager} transactionManager
   */
  constructor(contractFactory, transactionManager) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
  }

  /**
   * Claim role hats by proving control of an email at an allowlisted DOMAIN.
   * @param {string} contractAddress - ZkEmailInvites proxy
   * @param {Object} proof - EmailProof struct (see module header)
   * @param {string} claimer - address the hats mint to (must equal the address bound in proof.maskedCommand)
   * @param {Object} [options={}] - tx options (paymasterHatIds for gasless sponsorship)
   * @returns {Promise<TransactionResult>}
   */
  async claimRoleByDomain(contractAddress, proof, claimer, options = {}) {
    requireAddress(contractAddress, 'ZkEmailInvites contract address');
    requireAddress(claimer, 'Claimer address');
    if (!proof) throw new Error('Email proof is required');

    const contract = this.factory.createWritable(contractAddress, ZkEmailInvitesABI);
    return this.txManager.execute(contract, 'claimRoleByDomain', [proof, claimer], options);
  }

  /**
   * Read the domain rule (granted hat IDs + expiry) for a domain hash — used to show the org's
   * invite policy and which role(s) a claim would grant.
   * @param {string} contractAddress
   * @param {string} domainHash - keccak256 of the lowercased ASCII domain
   * @returns {Promise<{hatIds: bigint[], expiry: bigint, exists: boolean}>}
   */
  async getDomainRule(contractAddress, domainHash) {
    requireAddress(contractAddress, 'ZkEmailInvites contract address');
    const contract = this.factory.createReadOnly(contractAddress, ZkEmailInvitesABI);
    return contract.getDomainRule(domainHash);
  }

  /** Whether an email nullifier has already been consumed at this org (prevents double-claim). */
  async isNullifierUsed(contractAddress, nullifier) {
    requireAddress(contractAddress, 'ZkEmailInvites contract address');
    const contract = this.factory.createReadOnly(contractAddress, ZkEmailInvitesABI);
    return contract.isNullifierUsed(nullifier);
  }
}

/**
 * Create a ZkEmailInvitesService instance.
 * @param {ContractFactory} factory
 * @param {TransactionManager} txManager
 * @returns {ZkEmailInvitesService}
 */
export function createZkEmailInvitesService(factory, txManager) {
  return new ZkEmailInvitesService(factory, txManager);
}
