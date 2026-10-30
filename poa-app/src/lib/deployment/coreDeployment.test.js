import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import FrontendDeployerABI from '../../../abi/OrgDeployerNew.json';
import FrontendAccountABI from '../../../abi/PasskeyAccount.json';
import FrontendFactoryABI from '../../../abi/PasskeyAccountFactory.json';
import { mapCoreDeploymentParams, toCoreBootstrap, getCoreFundingValue } from '@/lib/deployment/coreDeployment';
import { encodePasskeyDeploymentCall, encodeDeploymentAccountInitCode } from '@/lib/deployment/passkeyCalls';
import { encodeOrgDeploymentCalldata, ORG_DEPLOYER_SCHEMA } from '@/features/deployer/utils/orgDeployerBoundary';
import { createDefaultRole, initialState } from '@/features/deployer/context/deployerReducer';
import { votingClassSchema } from '@/features/deployer/validation/schemas';

const DEPLOYER = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
const FACTORY = '0x3333333333333333333333333333333333333333';
const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ASSET = '0x4444444444444444444444444444444444444444';
const HASH = ethers.utils.id('content');
vi.mock('@/util/tokens', () => ({ getTokenByAddress: address => address === ASSET ? { decimals: 6 } : undefined }));
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); });
afterEach(() => { vi.unstubAllGlobals(); });

function fixture() {
  const state = structuredClone(initialState);
  state.organization = { ...state.organization, name: 'Together Org', description: 'Work together', tokenName: 'Ownership', tokenSymbol: 'MiXeD', autoUpgrade: false };
  state.roles = [0, 1].map(index => ({
    ...createDefaultRole(index, index === 0 ? 'Member' : 'Reviewer'),
    maxMembers: index === 0 ? 2 : 0,
    metadataCID: HASH,
  }));
  state.roles[0].distribution.additionalWearers = [ALICE, ALICE.toUpperCase().replace('0X', '0x'), DEPLOYER];
  state.roles[1].canVote = false;
  state.roles[1].open = false;
  state.roles[1].distribution.mintToDeployer = false;
  state.groups = [{ name: 'Together', memberRoleIndices: [1, 0] }];
  state.permissions = {
    quickJoinRoles: [0], tokenMemberRoles: [0, 1], tokenApproverRoles: [1], taskCreatorRoles: [0],
    educationCreatorRoles: [], educationMemberRoles: [0], hybridProposalCreatorRoles: [0], ddVotingRoles: [0], ddCreatorRoles: [1],
  };
  state.taskManagerPerms = { 0: 4, 1: 9 };
  state.voting = { ...state.voting, democracyWeight: 50, hybridQuorum: 67, ddQuorum: 51,
    hybridVoterQuorum: 4294967295, ddVoterQuorum: 0,
    classes: [
      { strategy: 0, slicePct: 50, quadratic: false, minBalance: '0.000000000000000001', hatIds: [0] },
      { strategy: 1, slicePct: 50, quadratic: true, minBalance: '1.5', asset: ASSET, hatIds: [1] },
    ],
  };
  state.features.educationHubEnabled = false;
  state.metadataAdminRoleIndex = null;
  state.paymaster = { enabled: true, operatorRoleIndex: null, autoWhitelistContracts: false,
    maxFeePerGas: '0.000000001', maxPriorityFeePerGas: '0.000000001', maxCallGas: '123',
    maxVerificationGas: '456', maxPreVerificationGas: '789', budgetCapEth: '0.000000000000000001',
    budgetEpochValue: '1.5', budgetEpochUnit: 'hours', fundingAmountEth: '0.000000000000000001' };
  state.bootstrap = {
    projects: [{ title: 'Café', metadataHash: HASH, cap: '900719.925474099313', managers: [ALICE],
      createHats: [0], claimHats: [1], reviewHats: [1], assignHats: [], bounties: [{ token: ASSET, cap: '12.345678' }] }],
    tasks: [{ title: 'First task', projectIndex: 0, metadataHash: HASH, payout: '0.000000000000000001',
      bountyToken: ASSET, bountyPayout: '1.000001', requiresApplication: true }],
  };
  return state;
}

describe('full authority deployment through core 2.0', () => {
  it.each([false, true])('matches the independent frontend ABI and every intended field (email=%s)', email => {
    const state = fixture();
    const params = mapCoreDeploymentParams(state, DEPLOYER, {
      registryAddress: REGISTRY, metadataHash: HASH, deployerUsername: 'founder',
      regSignatureData: { regNonce: '9007199254740993', regDeadline: '1900000000', regSignature: '0x1234' },
    });
    const expected = {
      orgId: ethers.utils.id('together-org'), orgName: 'Together Org', metadataHash: HASH,
      registryAddr: REGISTRY, deployerAddress: DEPLOYER, deployerUsername: 'founder',
      regNonce: '9007199254740993', regDeadline: '1900000000', regSignature: '0x1234', autoUpgrade: false,
      hybridThresholdPct: 67, ddThresholdPct: 51,
      hybridClasses: [
        { strategy: 0, slicePct: 50, quadratic: false, minBalance: '1', asset: ethers.constants.AddressZero, hatIds: [] },
        { strategy: 1, slicePct: 50, quadratic: true, minBalance: '1500000000000000000', asset: ASSET, hatIds: [] },
      ], ddInitialTargets: [],
      roles: [
        { name: 'Member', image: '', metadataCID: HASH, canVote: true, open: true, maxMembers: 2,
          vouching: { enabled: false, quorum: 0, voucherRoleIndex: 0 }, distribution: { mintToDeployer: true, additionalWearers: [ALICE] } },
        { name: 'Reviewer', image: '', metadataCID: HASH, canVote: false, open: false, maxMembers: 0,
          vouching: { enabled: false, quorum: 0, voucherRoleIndex: 0 }, distribution: { mintToDeployer: false, additionalWearers: [] } },
      ], groups: [{ name: 'Together', memberRoleIndices: [1, 0] }],
      roleAssignments: { quickJoinRolesBitmap: 1, tokenMemberRolesBitmap: 3, tokenApproverRolesBitmap: 2,
        taskCreatorRolesBitmap: 1, educationCreatorRolesBitmap: 0, educationMemberRolesBitmap: 1,
        hybridProposalCreatorRolesBitmap: 1, ddVotingRolesBitmap: 1, ddCreatorRolesBitmap: 2 },
      metadataAdminRoleIndex: ethers.constants.MaxUint256, passkeyEnabled: true, educationHubConfig: { enabled: false },
      bootstrap: {
        projects: [{ title: ethers.utils.hexlify(ethers.utils.toUtf8Bytes('Café')), metadataHash: HASH,
          cap: '900719925474099313000000', managers: [ALICE], createHats: [0], claimHats: [1], reviewHats: [1], assignHats: [],
          bountyTokens: [ASSET], bountyCaps: ['12345678'] }],
        tasks: [{ projectIndex: 0, payout: '1', title: ethers.utils.hexlify(ethers.utils.toUtf8Bytes('First task')),
          metadataHash: HASH, bountyToken: ASSET, bountyPayout: '1000001', requiresApplication: true }],
      }, paymasterConfig: { operatorRoleIndex: ethers.constants.MaxUint256, autoWhitelistContracts: false,
        maxFeePerGas: 1, maxPriorityFeePerGas: 1, maxCallGas: 123, maxVerificationGas: 456, maxPreVerificationGas: 789,
        defaultBudgetCapPerEpoch: 1, defaultBudgetEpochLen: 5400 },
      taskManagerPerms: { roleIndices: [0, 1], masks: [5, 8] }, hybridQuorum: 4294967295, ddQuorum: 0,
      tokenName: 'Ownership', tokenSymbol: 'MiXeD',
    };
    const method = email ? 'deployFullOrgWithZkEmail' : 'deployFullOrg';
    const args = email ? [expected, { enabled: true, initialRoot: ethers.constants.HashZero, initialCid: ethers.constants.HashZero }] : [expected];
    const expectedBytes = new ethers.utils.Interface(FrontendDeployerABI).encodeFunctionData(method, args);
    expect(encodeOrgDeploymentCalldata({ schema: ORG_DEPLOYER_SCHEMA.ACCESS_V2, params, zkEmailEnabled: email })).toBe(expectedBytes);
    expect(getCoreFundingValue(state.paymaster).toString()).toBe('1');
    const bootstrapInput = toCoreBootstrap(state.bootstrap);
    expect(bootstrapInput.projects[0]).not.toHaveProperty('createHats');
    expect(bootstrapInput.projects[0].createRoleIndices).toEqual([0]);
    expect(params.roles[0]).not.toHaveProperty('hierarchy');
  });

  it.each([
    ['no roles', state => { state.roles = []; }, /1–16/],
    ['legacy parent', state => { state.roles[0].hierarchy = { adminRoleIndex: 1 }; }, /saved draft.*retired/i],
    ['role capacity', state => { state.roles[0].maxMembers = 1; }, /genesis membership count/],
    ['closed QuickJoin', state => { state.roles[0].open = false; }, /must be open/],
    ['unknown permission role', state => { state.permissions.taskCreatorRoles = [2]; }, /references role index 2/],
    ['duplicate group member', state => { state.groups[0].memberRoleIndices = [0, 0]; }, /duplicate group/],
    ['zero task reward', state => { state.bootstrap.tasks[0].payout = '0'; }, /payout exceeds contract limits/],
    ['reward limit', state => { state.bootstrap.tasks[0].payout = '1000001'; }, /contract limits/],
    ['missing task project', state => { state.bootstrap.tasks[0].projectIndex = 1; }, /projectIndex/],
    ['invalid bootstrap manager', state => { state.bootstrap.projects[0].managers = ['invalid']; }, /bootstrap address/],
    ['long multibyte title', state => { state.bootstrap.tasks[0].title = 'é'.repeat(129); }, /UTF-8/],
    ['missing bounty token', state => { state.bootstrap.tasks[0].bountyToken = ''; }, /mismatch/],
    ['overprecision fee', state => { state.paymaster.maxFeePerGas = '0.0000000001'; }, /maxFeePerGas/],
    ['invalid permission mask', state => { state.taskManagerPerms[1] = 257; }, /masks/],
    ['too long Shares symbol', state => { state.organization.tokenSymbol = 'é'.repeat(9); }, /symbol exceeds 16/],
    ['negative native funding', state => { state.paymaster.fundingAmountEth = '-1'; }, /funding/],
  ])('rejects %s before any transport', (_label, mutate, pattern) => {
    const state = fixture(); mutate(state);
    expect(() => mapCoreDeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY })).toThrow(pattern);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires selected-chain registry and deployer addresses', () => {
    expect(() => mapCoreDeploymentParams(fixture(), DEPLOYER)).toThrow(/registry address/);
    expect(() => mapCoreDeploymentParams(fixture(), undefined, { registryAddress: REGISTRY })).toThrow(/deployer address/);
  });

  it('keeps literal minimum balances through the form schema and rejects unsafe numeric inputs', () => {
    const state = fixture();
    state.voting.classes[0].minBalance = '9007199254740993.000000000000000001';
    const parsed = votingClassSchema.parse({ ...state.voting.classes[0], id: 'direct', asset: null });
    expect(parsed.minBalance).toBe('9007199254740993.000000000000000001');
    const params = mapCoreDeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    expect(params.hybridClasses[0].minBalance.toString()).toBe('9007199254740993000000000000000001');
    state.paymaster.fundingAmountEth = Number.MAX_SAFE_INTEGER + 1;
    expect(() => getCoreFundingValue(state.paymaster)).toThrow(/exact decimal text/);
  });

  it('keeps disabled sponsorship, empty bootstrap, zero quorums and admin index zero deliberate', () => {
    const state = fixture(); state.paymaster.enabled = false; state.bootstrap = { projects: [], tasks: [] };
    state.metadataAdminRoleIndex = 0; state.voting.hybridVoterQuorum = 0;
    const params = mapCoreDeploymentParams(state, DEPLOYER, { registryAddress: REGISTRY });
    expect(params.metadataAdminRoleIndex.toString()).toBe('0');
    expect(params.bootstrap).toEqual({ projects: [], tasks: [] });
    expect(params.paymasterConfig.maxCallGas).toBe(0);
    expect(params.paymasterConfig.autoWhitelistContracts).toBe(false);
    expect(params.hybridQuorum).toBe(0);
    expect(getCoreFundingValue(state.paymaster).toString()).toBe('0');
  });
});

describe('passkey deployment inner calls', () => {
  it.each([false, true])('preserves exact native funding in single/batched execution (registration=%s)', register => {
    const value = '9007199254740993';
    const data = '0x12345678';
    const call = encodePasskeyDeploymentCall({ accountAddress: DEPLOYER, registryAddress: REGISTRY,
      username: 'founder', register, to: FACTORY, data, value });
    const iface = new ethers.utils.Interface(FrontendAccountABI);
    const decoded = iface.decodeFunctionData(register ? 'executeBatch' : 'execute', call);
    expect((register ? decoded[1][1] : decoded[1]).toString()).toBe(value);
    expect(register ? decoded[2][1] : decoded[2]).toBe(data);
    if (register) {
      expect(decoded[1][0].toString()).toBe('0');
      expect(decoded[2][0]).toBe(new ethers.utils.Interface(['function registerAccount(string)']).encodeFunctionData('registerAccount', ['founder']));
    }
  });
  it('encodes exact factory initCode without altering credential coordinates or large salt', () => {
    const input = { factoryAddress: FACTORY, credentialId: HASH, publicKeyX: ethers.utils.id('x'), publicKeyY: ethers.utils.id('y'), salt: '9007199254740993' };
    const call = new ethers.utils.Interface(FrontendFactoryABI).encodeFunctionData('createAccount', [input.credentialId, input.publicKeyX, input.publicKeyY, input.salt]);
    expect(encodeDeploymentAccountInitCode(input)).toBe(FACTORY + call.slice(2));
  });
});
