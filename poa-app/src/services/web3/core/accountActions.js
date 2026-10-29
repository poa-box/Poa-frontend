import { replaceUserProfileMetadata } from '@poa-box/core/metadata/user';
import { preparedProfileMetadataIntent, buildChangeUsername } from '@poa-box/core/tx/user';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { requireValidUsername } from '@/services/web3/utils/validation';

/** Host owns full-form replacement (including omission clears); extensions remain excluded. */
export async function executeProfileUpdate({ profileData, resolveSource, upload, createHost, guard, onStep = () => {} }) {
  const metadata = replaceUserProfileMetadata(profileData);
  guard();
  const { source } = await resolveSource('profile');
  guard();
  onStep('uploading');
  const intent = await preparedProfileMetadataIntent({ source, metadata, upload: async serialized => {
    guard();
    const cid = await upload(serialized);
    guard();
    return cid;
  } });
  guard();
  const host = await createHost(source);
  guard();
  const result = await executeCoreIntent(host.factory, host.manager, intent, { onStateChange: host.onStateChange });
  guard();
  if (!result.success) throw Object.assign(new Error(result.error?.userMessage || 'Your profile could not be saved. Please try again.'), { result });
  return { result, cid: intent.meta.ipfs.cid, source };
}

export async function executeUsernameUpdate({ username, resolveSource, createHost, guard, options = {} }) {
  requireValidUsername(username);
  guard();
  const { source } = await resolveSource('username');
  guard();
  const { onWriteSource, ...executionOptions } = options;
  await onWriteSource?.(source);
  guard();
  const host = await createHost(source);
  guard();
  const result = await executeCoreIntent(host.factory, host.manager,
    buildChangeUsername({ registryAddress: source.contract, newUsername: username }), executionOptions);
  guard();
  return result;
}
