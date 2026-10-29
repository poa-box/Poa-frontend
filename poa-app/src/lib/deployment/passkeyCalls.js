import { PasskeyAccountAbi } from '@poa-box/core/abis/PasskeyAccount';
import { PasskeyAccountFactoryAbi } from '@poa-box/core/abis/PasskeyAccountFactory';
import { buildRegisterAccount } from '@poa-box/core/tx/user';
import { encodeIntent } from '@poa-box/core/tx/intent';

/** Core encodes protocol calls; the host chooses whether atomic registration is needed. */
export function encodePasskeyDeploymentCall({ accountAddress, registryAddress, username, register, to, data, value }) {
  const args = register
    ? [[registryAddress, to], ['0', value], [encodeIntent(buildRegisterAccount({ registryAddress, username })).data, data]]
    : [to, value, data];
  return encodeIntent({
    to: accountAddress, abi: PasskeyAccountAbi, method: register ? 'executeBatch' : 'execute', args,
  }).data;
}

export function encodeDeploymentAccountInitCode({ factoryAddress, credentialId, publicKeyX, publicKeyY, salt }) {
  const { data } = encodeIntent({
    to: factoryAddress, abi: PasskeyAccountFactoryAbi, method: 'createAccount',
    args: [credentialId, publicKeyX, publicKeyY, salt],
  });
  return factoryAddress + data.slice(2);
}
