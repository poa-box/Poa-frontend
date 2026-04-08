/**
 * Merkle Distribution Utility
 *
 * Builds merkle trees for PaymentManager distributions.
 * Uses OpenZeppelin's StandardMerkleTree which matches the on-chain
 * verification: keccak256(bytes.concat(keccak256(abi.encode(address, uint256))))
 */

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { ethers } from 'ethers';

/**
 * Build a merkle tree for proportional distribution based on token balances.
 *
 * @param {Array<{address: string, balance: string}>} holders - Token holders with balances (in wei)
 * @param {string} totalAmount - Total amount to distribute (in wei)
 * @returns {{ root: string, claims: Object, treeData: string }}
 *   - root: bytes32 merkle root for on-chain verification
 *   - claims: { [address]: { amount: string, proof: string[] } } for IPFS storage
 *   - treeData: serialized tree for reconstruction
 */
export function buildDistributionTree(holders, totalAmount) {
  if (!holders || holders.length === 0) {
    throw new Error('No token holders found');
  }

  const totalAmountBN = ethers.BigNumber.from(totalAmount);
  if (totalAmountBN.lte(0)) {
    throw new Error('Distribution amount must be greater than 0');
  }

  // Calculate total supply from holder balances
  const totalSupply = holders.reduce(
    (sum, h) => sum.add(ethers.BigNumber.from(h.balance)),
    ethers.BigNumber.from(0)
  );

  if (totalSupply.eq(0)) {
    throw new Error('Total supply is 0 — no holders have tokens');
  }

  // Calculate proportional shares
  // share = (holderBalance * totalAmount) / totalSupply
  const leaves = [];
  let allocated = ethers.BigNumber.from(0);

  const sortedHolders = [...holders]
    .filter(h => ethers.BigNumber.from(h.balance).gt(0))
    .sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));

  for (let i = 0; i < sortedHolders.length; i++) {
    const holder = sortedHolders[i];
    const balance = ethers.BigNumber.from(holder.balance);

    let share;
    if (i === sortedHolders.length - 1) {
      // Last holder gets the remainder to avoid rounding dust
      share = totalAmountBN.sub(allocated);
    } else {
      share = balance.mul(totalAmountBN).div(totalSupply);
    }

    if (share.gt(0)) {
      leaves.push([holder.address, share.toString()]);
      allocated = allocated.add(share);
    }
  }

  if (leaves.length === 0) {
    throw new Error('No eligible holders after share calculation');
  }

  // Build the StandardMerkleTree
  // Leaf format: [address, uint256] — matches abi.encode(address, uint256)
  const tree = StandardMerkleTree.of(leaves, ['address', 'uint256']);

  // Build claims map with proofs
  const claims = {};
  for (const [i, leaf] of tree.entries()) {
    const [address, amount] = leaf;
    claims[address] = {
      amount,
      proof: tree.getProof(i),
    };
  }

  return {
    root: tree.root,
    claims,
    treeData: tree.dump(), // serializable for reconstruction
    holderCount: leaves.length,
    totalDistributed: allocated.toString(),
  };
}

/**
 * Get merkle proof for a specific address from stored claims data.
 *
 * @param {Object} claims - Claims map from buildDistributionTree or IPFS
 * @param {string} address - User address to look up
 * @returns {{ amount: string, proof: string[] } | null}
 */
export function getClaimData(claims, address) {
  if (!claims || !address) return null;
  // Normalize address for case-insensitive lookup
  const normalized = Object.keys(claims).find(
    k => k.toLowerCase() === address.toLowerCase()
  );
  return normalized ? claims[normalized] : null;
}
