/**
 * The elapsed-time words of the Agents view and the age of what waits on User. What matters: each unit boundary, an age that keeps only
 * its two largest units unpadded, a stamp in the future reading `0s` rather than a negative span, and a missing or unreadable stamp reading
 * no time at all.
 */
import { describe, expect, test } from 'bun:test';

import { ElapsedTimeUtil } from './ElapsedTimeUtil.ts';

describe('ElapsedTimeUtil', () => {
  test('seconds, minutes and hours each carry the units below them, zero-padded', () => {
    expect(ElapsedTimeUtil.formatElapsed(42_000)).toBe('42s');
    expect(ElapsedTimeUtil.formatElapsed(252_000)).toBe('4m 12s');
    expect(ElapsedTimeUtil.formatElapsed(3_737_000)).toBe('1h 02m 17s');
    expect(ElapsedTimeUtil.formatElapsed(-5_000)).toBe('0s');
  });

  test('the time since a stamp, and none for a missing or unreadable one', () => {
    const now = new Date('2026-10-29T20:00:12Z');
    expect(ElapsedTimeUtil.elapsedSinceText('2026-10-29T20:00:00Z', now)).toBe('12s');
    expect(ElapsedTimeUtil.elapsedSinceText(null, now)).toBeNull();
    expect(ElapsedTimeUtil.elapsedSinceText('not a stamp', now)).toBeNull();
  });

  test('an age shows seconds alone under a minute, minutes alone under an hour, then its two largest units unpadded', () => {
    expect(ElapsedTimeUtil.formatAge(0)).toBe('0s');
    expect(ElapsedTimeUtil.formatAge(40_000)).toBe('40s');
    expect(ElapsedTimeUtil.formatAge(2_952_000)).toBe('49m');
    expect(ElapsedTimeUtil.formatAge(12_120_000)).toBe('3h 22m');
    expect(ElapsedTimeUtil.formatAge(187_200_000)).toBe('2d 4h');
    expect(ElapsedTimeUtil.formatAge(-5_000)).toBe('0s');
  });

  test('the age since a stamp, and none for a missing or unreadable one', () => {
    const now = new Date('2026-10-29T20:00:40Z');
    expect(ElapsedTimeUtil.ageSinceText('2026-10-29T20:00:00Z', now)).toBe('40s');
    expect(ElapsedTimeUtil.ageSinceText(null, now)).toBeNull();
    expect(ElapsedTimeUtil.ageSinceText('not a stamp', now)).toBeNull();
  });
});
