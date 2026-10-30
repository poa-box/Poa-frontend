import { parseDecimalAmountToRaw, requireAssetDecimals, requireRawUint } from '@poa-box/core/amounts';

/** Exact integer math with the host's rounded-integer / truncated-fraction display policy. */
export function formatTokenAmount(value, decimals = 18, displayDecimals = 0) {
  if (value === null || value === undefined || value === '') return '0';
  try {
    requireAssetDecimals(decimals);
    requireAssetDecimals(displayDecimals);
    // Histories can contain signed deltas. Validate the magnitude with the uint codec.
    const negative = typeof value === 'string' && /^-\d+$/.test(value);
    const input = negative ? value.slice(1) : value;
    const raw = BigInt(requireRawUint(input));
    if (raw === 0n) return '0';
    const scale = 10n ** BigInt(decimals);
    const whole = raw / scale;
    const fraction = raw % scale;
    const sign = negative ? '-' : '';
    if (displayDecimals === 0) {
      return sign + (whole + (fraction * 2n >= scale ? 1n : 0n)).toString();
    }
    const digits = fraction.toString().padStart(decimals, '0').slice(0, displayDecimals).padEnd(displayDecimals, '0');
    return `${sign}${whole}.${digits}`;
  } catch {
    // Display remains recoverable; write parsing below deliberately fails closed.
    return '0';
  }
}

/** Parse literal decimal input once. Never truncate precision or repair malformed text. */
export function parseTokenAmount(amount, decimals = 18) {
  if (amount === null || amount === undefined || amount === '') return '0';
  if (typeof amount === 'number' && (!Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER || Object.is(amount, -0))) {
    throw new Error('Amount must be an exact decimal string or a safe number.');
  }
  if (!['string', 'number', 'bigint'].includes(typeof amount)) throw new Error('Invalid decimal amount.');
  return parseDecimalAmountToRaw(String(amount), decimals);
}
