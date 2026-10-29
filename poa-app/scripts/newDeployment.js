import { ethers } from 'ethers';
import { buildDeploymentParams, buildDeployFullOrg, buildDeployFullOrgWithZkEmail, deriveOrgId } from '@poa-box/core/tx/org';
import { encodeIntent } from '@poa-box/core/tx/intent';
import { ipfsCidToBytes32 } from '@poa-box/core/encoding/cid';
import { nameDeploymentTuple } from '@/lib/deployment/coreDeployment';
import {
  ORG_DEPLOYER_SCHEMA, OrgDeployerBoundaryError, assertDeployedOrgDeployerSchema,
  assertOrgDeploymentCalldataSchema, parseOrgDeploymentReceipt,
} from '@/features/deployer/utils/orgDeployerBoundary';

/** Pure preparation from the canonical named config. Retired name-derived roles
 * and preassembled legacy tuples must be reviewed in the current wizard. */
export function buildDeployCalldata({ config, deployerAddress, username = '',
  infrastructureAddresses = {}, orgDeployerSchema, infoIPFSHash, regSignatureData,
  zkEmailEnabled = false }) {
  if (orgDeployerSchema !== ORG_DEPLOYER_SCHEMA.ACCESS_V2) {
    throw new OrgDeployerBoundaryError('Legacy organization deployment is retired.');
  }
  if (!config) throw new OrgDeployerBoundaryError('A reviewed native deployment config is required. Reset the draft in the organization wizard.');
  const { orgDeployerAddress, registryAddress } = infrastructureAddresses;
  if (!ethers.utils.isAddress(orgDeployerAddress || '') || orgDeployerAddress === ethers.constants.AddressZero
    || !ethers.utils.isAddress(registryAddress || '') || registryAddress === ethers.constants.AddressZero
    || !ethers.utils.isAddress(deployerAddress || '') || deployerAddress === ethers.constants.AddressZero) {
    throw new OrgDeployerBoundaryError('Valid deployment, registry and founder addresses are required.');
  }
  const orgId = deriveOrgId(config.orgName).orgId;
  const deployParams = buildDeploymentParams(config, {
    orgId, registryAddr: registryAddress, deployerAddress, deployerUsername: username,
    metadataHash: infoIPFSHash ? ipfsCidToBytes32(infoIPFSHash) : ethers.constants.HashZero,
    regDeadline: regSignatureData?.regDeadline ?? 0, regNonce: regSignatureData?.regNonce ?? 0,
    regSignature: regSignatureData?.regSignature ?? '0x',
  });
  const args = { orgDeployerAddress, deployParams };
  const intent = zkEmailEnabled ? buildDeployFullOrgWithZkEmail({ ...args,
    zkConfig: { enabled: true, initialRoot: ethers.constants.HashZero, initialCid: ethers.constants.HashZero },
  }) : buildDeployFullOrg(args);
  return { calldata: encodeIntent(intent).data, orgDeployerAddress, orgId,
    params: nameDeploymentTuple(deployParams), schema: orgDeployerSchema };
}

/**
 * Send a pre-built deploy calldata blob with an ethers signer.
 *
 * This is the EOA counterpart to the passkey UserOp path: both now broadcast the
 * EXACT bytes that were simulated and shown in the preview modal. Previously the
 * wallet path re-derived its own DeploymentParams inside `main()`, which meant the
 * transaction that got signed could differ from the one that was simulated — most
 * visibly, `main()` always called `deployFullOrg`, so wallet deployers silently got
 * no ZkEmailInvites module no matter what the "Email Invites" toggle said.
 *
 * @param {Object} args
 * @param {Object} args.wallet - ethers signer
 * @param {string} args.to - OrgDeployer proxy address
 * @param {string} args.calldata - ABI-encoded deployFullOrg / deployFullOrgWithZkEmail call
 * @param {ethers.BigNumber|null} [args.valueWei] - msg.value for paymaster funding
 * @param {string} args.orgDeployerSchema - Schema selected from VERSION(); required
 * @param {number} args.expectedChainId - Chain the user selected; required
 * @returns {Promise<{ receipt: Object, deployment: Object|null }>}
 */
export async function deployWithCalldata({
  wallet,
  to,
  calldata,
  valueWei = null,
  orgDeployerSchema,
  expectedChainId,
}) {
  assertOrgDeploymentCalldataSchema({ schema: orgDeployerSchema, calldata });
  if (!Number.isInteger(Number(expectedChainId)) || Number(expectedChainId) <= 0) {
    throw new OrgDeployerBoundaryError(
      'A valid expected chain ID is required before sending deployment calldata.'
    );
  }
  const actualChainId = await wallet?.getChainId?.();
  if (Number(actualChainId) !== Number(expectedChainId)) {
    throw new OrgDeployerBoundaryError(
      `Wallet is connected to chain ${actualChainId ?? 'unknown'}, but this deployment targets chain ${expectedChainId}. Refusing to send.`
    );
  }
  await assertDeployedOrgDeployerSchema({
    provider: wallet?.provider,
    address: to,
    schema: orgDeployerSchema,
  });

  const value = valueWei || ethers.BigNumber.from(0);

  // The read-only simulation in /create already proved this reverts nowhere, so a
  // failed estimate here is a node quirk rather than a bad config — fall back to a
  // high ceiling rather than aborting a deploy the user already confirmed.
  let gasLimit;
  try {
    gasLimit = (await wallet.estimateGas({ to, data: calldata, value })).mul(120).div(100);
  } catch {
    console.warn('[DEPLOY] Gas estimation failed after simulation; using fallback limit.');
    gasLimit = ethers.BigNumber.from(25000000);
  }

  const tx = await wallet.sendTransaction({ to, data: calldata, value, gasLimit });
  console.log('[DEPLOY] Transaction sent:', tx.hash);
  const receipt = await tx.wait();
  console.log('[DEPLOY] Deployment confirmed:', receipt.transactionHash);
  const deployment = parseOrgDeploymentReceipt(receipt, orgDeployerSchema);
  return { receipt, deployment };
}
