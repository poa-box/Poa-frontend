import { describe, expect, it } from 'vitest';
import { ethers } from 'ethers';
import { parseTokenAmount, formatTokenAmount } from '@/util/formatToken';
import { formatBountyAmount, getBountyTokenOptions, hasBounty } from '@/util/tokens';
import { resolveTokenLabel } from '@/util/tokenLabel';
import { NETWORKS, getNetworkByChainId, getAllSubgraphUrls } from '@/config/networks';
import { requireAddress, requirePositiveNumber, requireValidUsername } from '@/services/web3/utils/validation';

describe('exact host amount boundary', () => {
  it('scales a large literal only once and preserves all 18 decimals', () => {
    const input = '9007199254740993123456.123456789012345678';
    const raw = '9007199254740993123456123456789012345678';
    expect(parseTokenAmount(input)).toBe(raw);
    expect(formatTokenAmount(raw, 18, 18)).toBe(input);
    expect(formatTokenAmount('999999999999999999999999999999999999500000000000000000')).toBe('1000000000000000000000000000000000000');
  });

  it('preserves integer rounding, truncated fractional display, signed history and zero-decimal assets', () => {
    expect(formatTokenAmount('1499999999999999999')).toBe('1');
    expect(formatTokenAmount('1500000000000000000')).toBe('2');
    expect(formatTokenAmount('1999999999999999999', 18, 2)).toBe('1.99');
    expect(formatTokenAmount('-1230000000000000000', 18, 2)).toBe('-1.23');
    expect(formatTokenAmount('120', 0, 2)).toBe('120.00');
    expect(parseTokenAmount('42', 0)).toBe('42');
    expect(parseTokenAmount('0.000001', 6)).toBe('1');
  });

  it.each(['-1', '+1', '1e3', '1x', ' 1', '1 ', '1.2.3', '.5', '1.', '0.0000001'])('refuses malformed or overprecise cash input %s', input => {
    expect(() => parseTokenAmount(input, 6)).toThrow();
  });

  it('rejects overflowing/unsafe input and does not reinterpret malformed display data', () => {
    const max = ((1n << 256n) - 1n).toString();
    expect(parseTokenAmount(max, 0)).toBe(max);
    expect(() => parseTokenAmount((1n << 256n).toString(), 0)).toThrow();
    expect(() => parseTokenAmount(Number.MAX_SAFE_INTEGER + 1, 0)).toThrow();
    expect(formatTokenAmount('1e18')).toBe('0');
    expect(formatTokenAmount(Number.MAX_SAFE_INTEGER + 1)).toBe('0');
    expect(parseTokenAmount('')).toBe('0');
  });

  it('formats large six-decimal bounty units without floating point rounding', () => {
    const usdc = NETWORKS.gnosis.bountyTokens.USDC;
    expect(formatBountyAmount('9007199254740993123456789', usdc)).toBe('9007199254740993123.46 USDC');
    expect(hasBounty(usdc, '1')).toBe(true);
    expect(hasBounty(usdc, '-1')).toBe(false);
    expect(hasBounty(usdc, '1e18')).toBe(false);
  });
});

describe('canonical config and member labels', () => {
  it('keeps the existing frontend chain and bounty choice set with valid checksums/decimals', () => {
    expect(Object.keys(NETWORKS)).toEqual(['arbitrum', 'gnosis']);
    expect(getNetworkByChainId(1)).toBeNull();
    expect(getAllSubgraphUrls().map(source => source.chainId)).toEqual([42161, 100]);
    expect(getBountyTokenOptions(100).map(token => [token.symbol, token.decimals])).toEqual([['BREAD', 18], ['USDC', 6], ['WXDAI', 18]]);
    expect(ethers.utils.getAddress(NETWORKS.gnosis.bountyTokens.USDC)).toBe(NETWORKS.gnosis.bountyTokens.USDC);
    expect(NETWORKS.gnosis.nativeCurrency.usdPegged).toBe(true);
  });

  it.each([
    [undefined, 'Shares'], [{ symbol: 'pOa' }, 'Shares'],
    [{ useTokenSymbol: false, symbol: 'pOa' }, 'Shares'],
    [{ useTokenSymbol: true, symbol: ' pOa ' }, 'pOa'],
    [{ useTokenSymbol: true, symbol: ' ' }, 'Shares'],
    [{ useTokenSymbol: true }, 'Shares'],
  ])('retains explicit symbol opt-in and original case', (config, expected) => {
    expect(resolveTokenLabel(config)).toBe(expected);
  });

  it('preserves friendly host validation around canonical address and username policy', () => {
    expect(() => requireAddress('bad')).toThrow('Address must be a valid Ethereum address');
    expect(() => requireValidUsername('a-b')).toThrow('Username can only contain letters, numbers, and underscores');
    expect(() => requireValidUsername('ab')).toThrow('Username must be at least 3 characters');
    expect(() => requireValidUsername('a', 1, 4)).not.toThrow();
    expect(() => requirePositiveNumber('2garbage', 'Hours')).toThrow('Hours must be a positive number');
    expect(() => requirePositiveNumber(Infinity, 'Hours')).toThrow();
  });
});
