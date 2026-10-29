// Finite contract-shaped offline fixture adapted from core provenance coverage.
import { vi } from 'vitest';
import { ethers } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { ENTRY_POINT } from '@poa-box/core/accounts/constants';
import { credentialIdDigest, derivePasskeySalt } from '@poa-box/core/accounts/codecs';
import { hashUserOperationV07, packUserOperationV07 } from '@poa-box/core/accounts/userop-v07';
import { USER_OPERATION_EVENTS } from '@poa-box/core/execute/outcome';
const TARGET = '0x1111111111111111111111111111111111111111', REGISTRY = '0x2222222222222222222222222222222222222222';
const FACTORY = '0x3333333333333333333333333333333333333333', ACCOUNT = '0x4444444444444444444444444444444444444444';
const OTHER = '0x5555555555555555555555555555555555555555';
export const TX = '0x' + 'a1'.repeat(32), HASH = '0x' + 'b2'.repeat(32), OLD_HASH = '0x' + 'c3'.repeat(32), B32 = '0x' + 'd4'.repeat(32);
const raw = '0x1234567890', credentialId = credentialIdDigest(raw);
export const legacy = { credentialId, publicKeyX: B32, publicKeyY: HASH, salt: BigInt(derivePasskeySalt(credentialId)).toString(), accountAddress: ACCOUNT, username: 'alice' };
const scope = { chainId: 100, orgId: 'org-id', contract: TARGET, account: ACCOUNT, contracts: { registry: REGISTRY, factory: FACTORY } };
const source = { ...scope, endpoint: 'mock://index', method: 'org-email-binding', indexed: true, snapshot: 'pinned', block: { number: '100', hash: HASH }, observedAt: 1000 };
const rpcSource = { ...source, endpoint: 'mock://rpc', method: 'bounded-email-recovery', indexed: false };
const freshness = { now: 1000, maxAgeSeconds: 0 };
const email = new ethers.utils.Interface(getAbi('ZkEmailInvites'));
const registry = new ethers.utils.Interface(getAbi('UniversalAccountRegistry'));
const factory = new ethers.utils.Interface(getAbi('PasskeyAccountFactory'));
const account = new ethers.utils.Interface(getAbi('PasskeyAccount'));
const entryPoint = new ethers.utils.Interface(['function handleOps((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops,address beneficiary)']);
/** Finite ABI fixture, not a cryptographic email proof or a live enrollment. */
export function emailRecoveryFixture({ success = true, version = 'domain' } = {}) {
    const auth = ['0x', '0x', 0, 0, B32, B32];
    const proof = [[1, 2], [[3, 4], [5, 6]], [7, 8], B32, B32, ...(version === 'email' ? [B32] : []), B32];
    const inner = email.encodeFunctionData(version === 'email' ? 'registerAndClaimByEmailWithPasskey' : 'registerAndClaimByDomainWithPasskey', [[credentialId, legacy.publicKeyX, legacy.publicKeyY, legacy.salt], legacy.username, 2000, 0, auth, proof, ['9007199254740993'], []]);
    const op = { sender: ACCOUNT, nonce: '9', callData: account.encodeFunctionData('execute', [TARGET, 0, inner]),
        callGasLimit: '100000', verificationGasLimit: '100000', preVerificationGas: '50000', maxFeePerGas: '2', maxPriorityFeePerGas: '1' };
    const opHash = hashUserOperationV07(op, ENTRY_POINT, 100);
    const packed = packUserOperationV07(op);
    const tx = { hash: TX, blockNumber: 50, blockHash: OLD_HASH, from: OTHER, to: ENTRY_POINT, value: ethers.BigNumber.from(0), chainId: 100,
        data: entryPoint.encodeFunctionData('handleOps', [[packed], OTHER]) };
    const event = USER_OPERATION_EVENTS.encodeEventLog(USER_OPERATION_EVENTS.getEvent('UserOperationEvent'), [opHash, ACCOUNT, ethers.constants.AddressZero, 9, success, 1, 1]);
    const receipt = { status: 1, transactionHash: TX, blockNumber: 50, blockHash: OLD_HASH,
        logs: [{ ...event, address: ENTRY_POINT, transactionHash: TX, blockNumber: 50, blockHash: OLD_HASH, removed: false }] };
    const state = { registry: REGISTRY, historicalRegistry: REGISTRY, factory: FACTORY, derived: ACCOUNT, code: '0x6000', credentialActive: true,
        publicKeyX: B32, username: success ? 'alice' : '', owner: success ? ACCOUNT : ethers.constants.AddressZero, org: scope.orgId, target: TARGET };
    const provider = {
        getNetwork: vi.fn(async () => ({ chainId: 100 })), getTransaction: vi.fn(async () => tx), getTransactionReceipt: vi.fn(async () => receipt),
        getBlock: vi.fn(async (tag) => ({ number: tag === '0x32' ? 50 : 100, hash: tag === '0x32' ? OLD_HASH : HASH, timestamp: 1000 })),
        getCode: vi.fn(async () => state.code),
        call: vi.fn(async (request, tag) => {
            const iface = request.to === TARGET ? email : request.to === REGISTRY ? registry : request.to === FACTORY ? factory : request.to === ACCOUNT ? account : null;
            if (!iface)
                throw new Error('Unexpected contract read');
            const parsed = iface.parseTransaction({ data: request.data });
            const result = parsed.name === 'accountRegistry' ? [tag === '0x32' ? state.historicalRegistry : state.registry]
                : parsed.name === 'universalFactory' ? [state.factory] : parsed.name === 'getAddress' ? [state.derived]
                    : parsed.name === 'getUsername' ? [state.username] : parsed.name === 'getAddressOfUsername' ? [state.owner]
                        : parsed.name === 'getCredential' ? [[state.publicKeyX, legacy.publicKeyY, 1, 0, state.credentialActive]] : null;
            if (!result)
                throw new Error('Unexpected method');
            return iface.encodeFunctionResult(parsed.name, result);
        }),
    };
    const query = vi.fn(async (_document, _variables, at) => ({
        _meta: { block: { number: Number(at.block.number), hash: at.block.hash } }, organization: { id: state.org, zkEmailInvites: { id: state.target } },
    }));
    const input = { scope, legacy, rawCredentialBytes: raw, originalTransactionHash: TX, source, rpcSource, query, provider: provider, freshness };
    return { input, provider, query, state, tx, receipt, op, packed, opHash, inner };
}
