/**
 * A system version against its own contract. What matters: a version is read only from whole numbers held as the value's own `major` and
 * `minor`; two versions order by major, then minor; a versions document whose minimum lies above its current version reads as none.
 */
import { describe, expect, test } from 'bun:test';

import { SystemVersionUtil } from './SystemVersionUtil.ts';

describe('systemVersionOf', () => {
  test('reads a major and a minor of whole numbers, passing over any other key', () => {
    expect(SystemVersionUtil.systemVersionOf({ major: 1, minor: 4, exampleAddedKey: true })).toEqual({ major: 1, minor: 4 });
  });

  test('reads nothing of a value that is no version', () => {
    for (const value of [{ major: 1 }, { major: '1', minor: 0 }, { major: 1, minor: -1 }, { major: 1.5, minor: 0 }, '1.0', null, [1, 0], Object.create({ major: 1, minor: 0 })]) {
      expect(SystemVersionUtil.systemVersionOf(value)).toBeNull();
    }
  });
});

describe('the order of two versions', () => {
  test('is by major, then by minor', () => {
    expect(SystemVersionUtil.isOlder({ major: 1, minor: 9 }, { major: 2, minor: 0 })).toBe(true);
    expect(SystemVersionUtil.isOlder({ major: 2, minor: 0 }, { major: 1, minor: 9 })).toBe(false);
    expect(SystemVersionUtil.isOlder({ major: 1, minor: 1 }, { major: 1, minor: 2 })).toBe(true);
    expect(SystemVersionUtil.comparisonOf({ major: 1, minor: 2 }, { major: 1, minor: 2 })).toBe(0);
  });
});

describe('versionsDocumentOf', () => {
  test('reads the current version and the minimum supported', () => {
    expect(SystemVersionUtil.versionsDocumentOf({ current: { major: 1, minor: 3 }, minimumSupported: { major: 1, minor: 0 } }))
      .toEqual({ current: { major: 1, minor: 3 }, minimumSupported: { major: 1, minor: 0 } });
  });

  test('reads no document that lacks either version, names one that is no version, or names a minimum above its current version', () => {
    for (const value of [
      { current: { major: 1, minor: 0 } },
      { current: { major: 1, minor: 0 }, minimumSupported: '1.0' },
      { current: { major: 1, minor: 0 }, minimumSupported: { major: 1, minor: 2 } },
      { refusal: 'not-found' },
      null,
    ]) expect(SystemVersionUtil.versionsDocumentOf(value)).toBeNull();
  });

  test('writes a version as major.minor', () => {
    expect(SystemVersionUtil.textOf({ major: 2, minor: 10 })).toBe('2.10');
  });
});
