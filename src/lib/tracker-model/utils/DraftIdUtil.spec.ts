/**
 * The draft id and its number. What matters: an id is `D` and an unpadded number, so it never reads as a ticket id; every id written reads
 * back as its number; and anything not written that way, a padded or zero number, a ticket id or a number past the safe integers, reads as
 * no draft id rather than a near one.
 */
import { describe, expect, test } from 'bun:test';

import { DraftIdUtil } from './DraftIdUtil.ts';

const { draftIdOf, draftNumberOf } = DraftIdUtil;

describe('draftIdOf', () => {
  test('writes `D` and the number, never padded', () => {
    expect(draftIdOf(1)).toBe('D1');
    expect(draftIdOf(12)).toBe('D12');
  });
});

describe('draftNumberOf', () => {
  test('reads back the number of every id draftIdOf writes', () => {
    for (const draftNumber of [1, 9, 10, 4096]) expect(draftNumberOf(draftIdOf(draftNumber))).toBe(draftNumber);
  });

  test('refuses a zero or padded number, since no id is written that way', () => {
    expect(draftNumberOf('D0')).toBeNull();
    expect(draftNumberOf('D01')).toBeNull();
  });

  test('refuses a ticket id, a lower-case prefix, a bare prefix and surrounding text', () => {
    for (const text of ['001', '1', 'd1', 'D', ' D1', 'D1 ', 'D1a', 'DD1']) expect(draftNumberOf(text), text).toBeNull();
  });

  test('refuses a number past the safe integers, which would not read back as written', () => {
    expect(draftNumberOf('D9007199254740993')).toBeNull();
  });
});
