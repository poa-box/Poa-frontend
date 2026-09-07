/**
 * Encoding Utilities
 * Helper functions for encoding/decoding blockchain data
 */

import { ethers } from 'ethers';
export { ipfsCidToBytes32, bytes32ToIpfsCid } from '@/lib/ipfs/cidBytes32';

/**
 * Convert a string to UTF-8 bytes
 * @param {string} str - String to convert
 * @returns {Uint8Array} UTF-8 encoded bytes
 */
export function stringToBytes(str) {
  return ethers.utils.toUtf8Bytes(str);
}

/**
 * Convert bytes to string
 * @param {Uint8Array} bytes - Bytes to decode
 * @returns {string} Decoded string
 */
export function bytesToString(bytes) {
  return ethers.utils.toUtf8String(bytes);
}

/**
 * Convert a string to its keccak256 hash (bytes32)
 * Used for descriptions, submissions, etc.
 * @param {string} str - String to hash
 * @returns {string} Keccak256 hash as hex string
 */
export function stringToBytes32(str) {
  if (!str) return ethers.constants.HashZero;
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(str));
}

/**
 * Parse a task ID from subgraph format
 *
 * Subgraph may return IDs like "orgId-taskId"
 * Contract expects just the numeric taskId
 *
 * @param {string|number} taskId - Task ID (possibly prefixed)
 * @returns {string} Parsed task ID
 */
export function parseTaskId(taskId) {
  const taskIdStr = taskId.toString();
  return taskIdStr.includes('-') ? taskIdStr.split('-')[1] : taskIdStr;
}

/**
 * Parse a module ID from subgraph format
 * @param {string|number} moduleId - Module ID (possibly prefixed)
 * @returns {string} Parsed module ID
 */
export function parseModuleId(moduleId) {
  const moduleIdStr = moduleId.toString();
  return moduleIdStr.includes('-') ? moduleIdStr.split('-')[1] : moduleIdStr;
}

/**
 * Parse a project ID from subgraph format or string
 *
 * The subgraph stores project IDs as "{contractAddress}-{projectId}"
 * where projectId is a bytes32 hex string (the actual project ID from the contract).
 * The contract uses auto-incrementing numeric IDs stored as bytes32.
 *
 * @param {string} projectId - Project ID (subgraph format or raw bytes32)
 * @returns {string} bytes32 project ID
 */
export function parseProjectId(projectId) {
  if (!projectId) {
    return ethers.constants.HashZero;
  }

  // If already a bytes32 hex string, return as-is
  if (projectId.startsWith('0x') && projectId.length === 66) {
    return projectId;
  }

  // Check for subgraph format: "{contractAddress}-{projectId}"
  // Contract address is 42 chars (0x + 40 hex), projectId is 66 chars (0x + 64 hex)
  // Format: "0x1234...-0x0000..."
  const subgraphPattern = /^0x[a-fA-F0-9]{40}-(.+)$/;
  const match = projectId.match(subgraphPattern);

  if (match) {
    const extractedId = match[1];

    // If the extracted part is already a valid bytes32, return it
    if (extractedId.startsWith('0x') && extractedId.length === 66) {
      return extractedId;
    }
    // If it's a hex string without 0x prefix, add it and pad to bytes32
    if (/^[a-fA-F0-9]+$/.test(extractedId)) {
      const padded = ethers.utils.hexZeroPad('0x' + extractedId, 32);
      return padded;
    }
  }

  // Legacy: if it's a plain string name, hash it (for backwards compatibility)
  const hashed = stringToBytes32(projectId);
  return hashed;
}

/**
 * Format an address for display (shortened)
 * @param {string} address - Full address
 * @param {number} [chars=4] - Characters to show on each side
 * @returns {string} Formatted address (e.g., "0x1234...5678")
 */
export function formatAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Check if a string is a valid Ethereum address
 * @param {string} address - Address to check
 * @returns {boolean} True if valid
 */
export function isValidAddress(address) {
  return ethers.utils.isAddress(address);
}

/**
 * Get checksum address
 * @param {string} address - Address to checksum
 * @returns {string} Checksummed address
 */
export function toChecksumAddress(address) {
  return ethers.utils.getAddress(address);
}
