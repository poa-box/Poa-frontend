/**
 * HatsService
 * Read-only Hats Protocol queries — used to verify current hat wearers
 * synchronously at submit time so election batches reflect on-chain truth
 * (subgraph-derived holder lists can be stale).
 *
 * Accepts either a ContractFactory (uses factory.createReadOnly) or a raw
 * ethers Provider (instantiates the Contract directly). The Provider form
 * is required when the read must target a specific chain (e.g. when an
 * EOA wallet is on a different chain than the org being acted on).
 */

import { Contract } from 'ethers';
import HatsABI from '../../../../abi/Hats.json';
import { requireAddress } from '../utils/validation';

export class HatsService {
  /**
   * @param {ContractFactory|ethers.providers.Provider} factoryOrProvider
   */
  constructor(factoryOrProvider) {
    this.source = factoryOrProvider;
  }

  _getContract(hatsProtocolAddress) {
    // Duck-type the factory by its createReadOnly method; fall back to
    // treating the source as an ethers Provider.
    if (this.source && typeof this.source.createReadOnly === 'function') {
      return this.source.createReadOnly(hatsProtocolAddress, HatsABI);
    }
    return new Contract(hatsProtocolAddress, HatsABI, this.source);
  }

  /**
   * @param {string} hatsProtocolAddress
   * @param {string|BigInt} hatId
   * @param {string} address
   * @returns {Promise<boolean>}
   */
  async isWearerOfHat(hatsProtocolAddress, hatId, address) {
    requireAddress(hatsProtocolAddress, 'Hats protocol address');
    requireAddress(address, 'Wearer address');
    if (hatId === undefined || hatId === null || hatId === '') {
      throw new Error('Hat ID is required');
    }
    return this._getContract(hatsProtocolAddress).isWearerOfHat(address, hatId);
  }

  /**
   * Bulk-check `isWearerOfHat` for a set of addresses against the same hat.
   * Throws if any individual call fails — partial results are not returned,
   * because building a tx batch off partial truth defeats the purpose.
   *
   * @param {string} hatsProtocolAddress
   * @param {string|BigInt} hatId
   * @param {string[]} addresses
   * @returns {Promise<Map<string, boolean>>} keyed by lowercased address
   */
  async getHolderStatuses(hatsProtocolAddress, hatId, addresses) {
    requireAddress(hatsProtocolAddress, 'Hats protocol address');
    if (hatId === undefined || hatId === null || hatId === '') {
      throw new Error('Hat ID is required');
    }
    const result = new Map();
    if (!addresses || addresses.length === 0) return result;

    const contract = this._getContract(hatsProtocolAddress);
    // Promise.all rather than allSettled: we re-throw on any rejection
    // anyway, and Promise.all signals failure earlier without ceremony.
    const values = await Promise.all(
      addresses.map((a) => contract.isWearerOfHat(a, hatId))
    );
    for (let i = 0; i < addresses.length; i++) {
      result.set(addresses[i].toLowerCase(), Boolean(values[i]));
    }
    return result;
  }
}

/**
 * @param {ContractFactory|ethers.providers.Provider} factoryOrProvider
 * @returns {HatsService}
 */
export function createHatsService(factoryOrProvider) {
  return new HatsService(factoryOrProvider);
}
