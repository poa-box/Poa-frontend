/**
 * MembershipAuthorityService — the direct-write surface of access v2.
 *
 * Everything a USER or a MANAGER does themselves goes through here; everything GOVERNANCE does is
 * a batch composed by `lib/accessV2/proposalBuilders` and submitted through `VotingService`.
 *
 * SPONSORSHIP. All of these selectors have entries in the paymaster's type-keyed global rulebook,
 * so a passkey user pays no gas. The hub prices sponsorship against the SUBJECT ids passed as
 * `paymasterHatIds` — which for v2 are subject ids, not hats, and are the same value either way
 * because a migrated org adopts its hatIds verbatim. Omitting them makes the manager fall back to
 * the user's existing hats, which is the right behaviour for an existing member and the WRONG one
 * for someone claiming their first role (they hold nothing yet) — so the claim paths pass them.
 *
 * PREFLIGHTS. `canClaim` / `canGrant` / `canRemove` exist because `announceWinner` swallows inner
 * reverts and a direct call's revert data is not much friendlier. Call them, render
 * `actionReasonCopy()` / `removalBlockers()`, and never let a user meet a raw revert.
 */

import { MembershipAuthorityAbi as MembershipAuthorityABI } from '@poa-box/core/abis/MembershipAuthority';
import { buildAuthorityAction } from '@poa-box/core/tx/authority';
import { normalizeSubjectId } from '@poa-box/core/authority/ids';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { requireAddress } from '@/services/web3/utils/validation';
import { knownFact, assertSourceBlock } from '@poa-box/core/data/facts';
import { requireRawUint } from '@poa-box/core/amounts';

const requireSubject = (subjectId) => {
  if (subjectId === null || subjectId === undefined || subjectId === '') {
    throw new Error('Subject id is required');
  }
  return normalizeSubjectId(subjectId);
};

export class MembershipAuthorityService {
  /**
   * @param {ContractFactory} contractFactory
   * @param {TransactionManager} transactionManager
   * @param {ContractFactory} [readFactory] - optional org-chain factory for cross-chain reads
   */
  constructor(contractFactory, transactionManager, readFactory = contractFactory) {
    this.factory = contractFactory;
    this.readFactory = readFactory;
    this.txManager = transactionManager;
  }

  _execute(authority, method, args, options) {
    requireAddress(authority, 'MembershipAuthority address');
    return executeCoreIntent(this.factory, this.txManager,
      buildAuthorityAction({ authorityAddress: authority, method, args }), options);
  }

  _readonly(authority) {
    requireAddress(authority, 'MembershipAuthority address');
    return this.readFactory.createReadOnly(authority, MembershipAuthorityABI);
  }

  // ── user-driven ────────────────────────────────────────────────────────────────────────────

  /**
   * Accept a claimable seat. For a delegated OFFER this IS the finalize — before the pending
   * entry's `activatesAt` it reverts `NotYetActive`, which is why the offer UI shows a countdown.
   */
  async claim(authority, subjectId, options = {}) {
    const id = requireSubject(subjectId);
    return this._execute(authority, 'claim', [id], {
      paymasterHatIds: [id],
      ...options,
    });
  }

  /** Resign. A sticky governance grant survives this and the seat stays claimable. */
  async renounce(authority, subjectId, options = {}) {
    return this._execute(
      authority,
      'renounce',
      [requireSubject(subjectId)],
      options
    );
  }

  async vouch(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this._execute(
      authority,
      'vouch',
      [requireSubject(subjectId), user],
      options
    );
  }

  async revokeVouch(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this._execute(
      authority,
      'revokeVouch',
      [requireSubject(subjectId), user],
      options
    );
  }

  // ── delegated (manager) ────────────────────────────────────────────────────────────────────

  async delegatedGrant(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this._execute(
      authority,
      'delegatedGrant',
      [requireSubject(subjectId), user],
      options
    );
  }

  async delegatedOffer(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this._execute(
      authority,
      'delegatedOffer',
      [requireSubject(subjectId), user],
      options
    );
  }

  /**
   * @param {boolean} ban - false is SOFT and reverts `RemovalIneffective` when the target stays
   *   eligible; check `canRemove` first so the dialog can name the surviving source.
   */
  async delegatedRemove(authority, subjectId, user, ban = false, options = {}) {
    requireAddress(user, 'User address');
    return this._execute(
      authority,
      'delegatedRemove',
      [requireSubject(subjectId), user, Boolean(ban)],
      options
    );
  }

  async delegatedUnremove(authority, subjectId, user, options = {}) {
    requireAddress(user, 'User address');
    return this._execute(
      authority,
      'delegatedUnremove',
      [requireSubject(subjectId), user],
      options
    );
  }

  async finalize(authority, pendingId, options = {}) {
    return this._execute(
      authority,
      'finalize',
      [normalizeSubjectId(pendingId)],
      options
    );
  }

  async cancel(authority, pendingId, options = {}) {
    return this._execute(authority, 'cancel', [normalizeSubjectId(pendingId)], options);
  }

  /**
   * Permissionless repair of an accepted-but-ineligible member (a lapsed vouch quorum, a cleared
   * email flag, a flipped default). Anyone may call it — it is the thing that unblocks a
   * seat-capped role whose cap is held by ghosts.
   */
  async reconcile(authority, subjectId, users, options = {}) {
    const list = Array.isArray(users) ? users : [users];
    list.forEach((u) => requireAddress(u, 'User address'));
    return this._execute(
      authority,
      'reconcile(uint256,address[])',
      [requireSubject(subjectId), list],
      options
    );
  }

  // ── preflights + reads ─────────────────────────────────────────────────────────────────────

  /** @returns {Promise<{reason: number, activatesAt: string, lapsedCandidate: string}>} */
  async canClaim(authority, subjectId, user) {
    requireAddress(user, 'User address');
    const r = await this._readonly(authority).canClaim(requireSubject(subjectId), user);
    return { reason: Number(r.reason ?? r[0]), activatesAt: String(r.activatesAt ?? r[1]), lapsedCandidate: r.lapsedCandidate ?? r[2] };
  }

  /** @returns {Promise<{reason: number, lapsedCandidate: string}>} */
  async canGrant(authority, subjectId, user) {
    requireAddress(user, 'User address');
    const r = await this._readonly(authority).canGrant(requireSubject(subjectId), user);
    return { reason: Number(r.reason ?? r[0]), lapsedCandidate: r.lapsedCandidate ?? r[1] };
  }

  /**
   * @returns {Promise<{reason: number, sourceSet: number}>} `sourceSet` is the enum-SET of
   *   surviving eligibility sources — feed it to `removalBlockers()` for source-accurate copy.
   */
  async canRemove(authority, subjectId, user, ban = false) {
    requireAddress(user, 'User address');
    const r = await this._readonly(authority).canRemove(requireSubject(subjectId), user, Boolean(ban));
    return { reason: Number(r.reason ?? r[0]), sourceSet: Number(r.sourceSet ?? r[1]) };
  }

  async isMember(authority, subjectId, user) {
    requireAddress(user, 'User address');
    return this._readonly(authority).isMember(requireSubject(subjectId), user);
  }

  /** The live fold for one (subject, user) — the escape hatch when the subgraph lags a block. */
  async getStatus(authority, subjectId, user) {
    requireAddress(user, 'User address');
    const r = await this._readonly(authority).getStatus(requireSubject(subjectId), user);
    return {
      accepted: Boolean(r.accepted ?? r[0]),
      eligible: Boolean(r.eligible_ ?? r[1]),
      acceptedAt: String(r.acceptedAt ?? r[2]),
      ruleKind: Number(r.ruleKind ?? r[3]),
    };
  }

  async hasPerm(authority, user, permKey, ctx) {
    requireAddress(user, 'User address');
    const word = await this._readonly(authority).hasPerm(user, permKey, ctx);
    return word.toString();
  }

  /** Effective (epoch-adjusted) counter for a target not yet represented by the index.
   * Keep this distinct from raw wearer storage: the contract exposes no wearer-epoch getter.
   * Both counter and config are observed at the same verified indexed inclusion block.
   */
  async readEffectiveVouchCount(authority, subjectId, user, { source, config }) {
    requireAddress(user, 'User address');
    if (/^0x0{40}$/i.test(user)) throw new Error('A nonzero user address is required.');
    const id = requireSubject(subjectId);
    if (!source || !Number.isSafeInteger(source.chainId) || source.chainId <= 0 || !source.orgId
      || source.contract?.toLowerCase() !== authority.toLowerCase()
      || source.account?.toLowerCase() !== user.toLowerCase() || !source.block?.hash
      || !/^0x[0-9a-f]{64}$/i.test(source.block.hash)) throw new Error('Vouch observation scope is unavailable.');
    const blockNumber = Number(requireRawUint(source.block.number));
    if (!Number.isSafeInteger(blockNumber)) throw new Error('Vouch observation block is unavailable.');
    const contract = this._readonly(authority);
    const provider = contract.provider;
    const verifyBlock = async () => {
      const [network, block] = await Promise.all([provider.getNetwork(), provider.getBlock(blockNumber)]);
      if (network.chainId !== source.chainId) throw new Error('Vouch observation network changed.');
      assertSourceBlock(block && { number: String(block.number), hash: block.hash }, source.block);
    };
    await verifyBlock();
    const [observedConfig, count] = await Promise.all([
      contract.vouchConfig(id, { blockTag: blockNumber }),
      contract.vouchCount(id, user, { blockTag: blockNumber }),
    ]);
    await verifyBlock();
    const exact = (value, width) => requireRawUint(value.toString(), width);
    if (exact(observedConfig.quorum ?? observedConfig[0], 32) !== exact(config.quorum, 32)
      || exact(observedConfig.voucherSubject ?? observedConfig[1], 256) !== requireSubject(config.voucherSubjectId)
      || exact(observedConfig.epoch ?? observedConfig[2], 64) !== exact(config.epoch, 64)) {
      throw new Error('Vouch configuration does not match the selected observation.');
    }
    return knownFact(exact(count, 32), { ...source, indexed: false, method: 'vouchCount',
      endpoint: provider.connection?.url || 'org-chain-provider', snapshot: 'pinned' });
  }

  async paused(authority) {
    return this._readonly(authority).paused();
  }
}

export function createMembershipAuthorityService(factory, txManager, readFactory = factory) {
  return new MembershipAuthorityService(factory, txManager, readFactory);
}
