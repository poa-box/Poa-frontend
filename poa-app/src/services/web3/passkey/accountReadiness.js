import { p256 } from '@noble/curves/p256';
import { encodeFunctionData } from 'viem';
import { PasskeyAccountAbi } from '@poa-box/core/abis/PasskeyAccount';
import { PasskeyAccountFactoryAbi } from '@poa-box/core/abis/PasskeyAccountFactory';
import { computeCredentialId } from '@/services/web3/passkey/passkeyUtils';

const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
const hasCode = value => typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value) && value !== '0x';
const unavailable = () => new Error('We couldn’t verify this account on the selected network. Please try signing in again.');

export function validateCredentialKeys(credential) {
  if (!credential || !/^0x[0-9a-f]{64}$/i.test(credential.publicKeyX || '')
    || !/^0x[0-9a-f]{64}$/i.test(credential.publicKeyY || '')) throw unavailable();
  try {
    p256.ProjectivePoint.fromHex(`04${credential.publicKeyX.slice(2)}${credential.publicKeyY.slice(2)}`).assertValidity();
    if (credential.rawCredentialId && computeCredentialId(credential.rawCredentialId).toLowerCase() !== credential.credentialId?.toLowerCase()) throw unavailable();
  } catch { throw unavailable(); }
  return credential;
}

/** Only the observed credential source can restore missing keys. Outage never means absence. */
export async function restoreCredentialKeys(credential, { clientForChain, guard = () => {} }) {
  guard();
  if (credential.publicKeyX && credential.publicKeyY) return validateCredentialKeys(credential);
  if (!address(credential.accountAddress) || !Number.isSafeInteger(credential.credentialChainId)) throw unavailable();
  const client = clientForChain(credential.credentialChainId);
  if (!client || await client.getChainId() !== credential.credentialChainId) throw unavailable();
  guard();
  if (!hasCode(await client.getBytecode({ address: credential.accountAddress }))) throw unavailable();
  guard();
  const stored = await client.readContract({ address: credential.accountAddress, abi: PasskeyAccountAbi,
    functionName: 'getCredential', args: [credential.credentialId] });
  guard();
  if (stored?.active !== true) throw unavailable();
  return validateCredentialKeys({ ...credential, publicKeyX: stored.publicKeyX, publicKeyY: stored.publicKeyY });
}

/** Action-runtime read only: no public page acquires an RPC account reader. */
export async function resolveAccountDeployment({ credential, factoryAddress, publicClient, chainId, guard = () => {} }) {
  guard();
  if (!address(credential?.accountAddress) || !publicClient || await publicClient.getChainId() !== chainId) throw unavailable();
  guard();
  const bytecode = await publicClient.getBytecode({ address: credential.accountAddress });
  guard();
  if (hasCode(bytecode)) return { status: 'deployed', initCode: '0x' };
  validateCredentialKeys(credential);
  if (!address(factoryAddress) || !hasCode(await publicClient.getBytecode({ address: factoryAddress }))) throw unavailable();
  guard();
  const args = [credential.credentialId, credential.publicKeyX, credential.publicKeyY, BigInt(credential.salt)];
  const expected = await publicClient.readContract({ address: factoryAddress, abi: PasskeyAccountFactoryAbi, functionName: 'getAddress', args });
  guard();
  if (!address(expected) || expected.toLowerCase() !== credential.accountAddress.toLowerCase()) throw unavailable();
  return { status: 'deployable', initCode: factoryAddress + encodeFunctionData({ abi: PasskeyAccountFactoryAbi, functionName: 'createAccount', args }).slice(2) };
}
