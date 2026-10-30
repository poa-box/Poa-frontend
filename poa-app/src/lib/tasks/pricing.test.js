import { describe, expect, it } from 'vitest';
import {
  calculatePayout, normalizeHourlyRate, formatEstTime, splitHoursMinutes, combineHoursMinutes,
  parseTaskId, parseModuleId,
} from '@/util/taskUtils';
import { resolveTokenLabel } from '@/util/tokenLabel';

describe('host task pricing conventions with core payout', () => {
  it('retains difficulty pricing and quarter-hour rates in both modes', () => {
    expect(calculatePayout('medium', 0.25)).toBe(10);
    expect(calculatePayout('hard', 0.25, { hoursOnly: true, hourlyRate: 20 })).toBe(5);
    expect(calculatePayout('unknown', 1)).toBe(28);
    expect(normalizeHourlyRate('')).toBe(10);
    expect(formatEstTime('0.25')).toBe('15m');
    expect(combineHoursMinutes(1, 15)).toBe(1.25);
    expect(splitHoursMinutes(1.25)).toEqual({ hours: 1, minutes: 15 });
  });
  it('keeps configured case and Shares fallback in all resolver modes', () => {
    for (const config of [{}, { symbol: 'MiXeD' }, { useTokenSymbol: false, symbol: 'MiXeD' },
      { useTokenSymbol: true }, { useTokenSymbol: true, symbol: '  ' }]) {
      expect(resolveTokenLabel(config)).toBe('Shares');
    }
    expect(resolveTokenLabel({ useTokenSymbol: true, symbol: 'MiXeD' })).toBe('MiXeD');
  });
  it('shares foundation ID parsing without coercing large ID strings to Number', () => {
    const entity = '0x' + '12'.repeat(20) + '-9007199254740993';
    expect(parseTaskId(entity)).toBe('9007199254740993');
    expect(parseModuleId(entity)).toBe('9007199254740993');
  });
});
