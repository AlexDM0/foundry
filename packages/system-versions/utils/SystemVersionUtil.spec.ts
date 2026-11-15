/**
 * System versions against their own contract. What matters: versions order by major first and minor second, never as text or decimals,
 * so 1.10 is newer than 1.9; and only `major.minor` of whole numbers reads as a version.
 */
import { describe, expect, test } from 'bun:test';

import { SystemVersionUtil } from './SystemVersionUtil.ts';

describe('the system version', () => {
  test('orders by major first and minor second, so 1.10 is newer than 1.9 and 2.0 newer than both', () => {
    expect(SystemVersionUtil.isOlder({ major: 1, minor: 9 }, { major: 1, minor: 10 })).toBe(true);
    expect(SystemVersionUtil.isOlder({ major: 1, minor: 10 }, { major: 2, minor: 0 })).toBe(true);
    expect(SystemVersionUtil.isOlder({ major: 1, minor: 1 }, { major: 1, minor: 1 })).toBe(false);
    expect(SystemVersionUtil.comparisonOf({ major: 1, minor: 1 }, { major: 1, minor: 1 })).toBe(0);
  });

  test('is written as major.minor and read back from that text', () => {
    expect(SystemVersionUtil.textOf({ major: 3, minor: 0 })).toBe('3.0');
    expect(SystemVersionUtil.versionOfText('3.0')).toEqual({ major: 3, minor: 0 });
    expect(SystemVersionUtil.versionOfText('1.10')).toEqual({ major: 1, minor: 10 });
  });

  test('reads no version from text that is not two whole numbers without leading zeros', () => {
    expect(['3', '3.0.1', '03.0', '3.-1', 'v3.0', '3.0 ', ''].map((text) => SystemVersionUtil.versionOfText(text))).toEqual([null, null, null, null, null, null, null]);
  });
});
