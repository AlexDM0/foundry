/**
 * The brain's words and machine values. What matters: its time left counts down to the forge's `endsAt` and stops at `0:00`, never below;
 * a stamp that does not read as a time gives nothing rather than a wrong time; the four-bar mark knows the effort words the forge's
 * sessions take and no other; and who woke it is said by place, never by person.
 */
import { describe, expect, test } from 'bun:test';

import { BrainTextUtil } from './BrainTextUtil.ts';

const READ_AT_MILLISECONDS = Date.parse('2026-11-12T13:19:30.000Z');

describe('times', () => {
  test('the time left counts down to endsAt in minutes and seconds and stops at 0:00', () => {
    expect(BrainTextUtil.timeLeftText('2026-11-12T13:20:54.000Z', READ_AT_MILLISECONDS)).toBe('1:24');
    expect(BrainTextUtil.timeLeftText('2026-11-12T13:19:00.000Z', READ_AT_MILLISECONDS)).toBe('0:00');
    expect(BrainTextUtil.timeLeftText('2026-11-12T13:31:35.000Z', READ_AT_MILLISECONDS)).toBe('12:05');
  });

  test('the run time counts from the forge\'s start, and the span from its start to its end', () => {
    expect(BrainTextUtil.runTimeText('2026-11-12T13:18:54.000Z', READ_AT_MILLISECONDS)).toBe('0:36');
    expect(BrainTextUtil.spanText('2026-11-12T13:18:54.000Z', '2026-11-12T13:20:54.000Z')).toBe('2:00');
  });

  test('a missing or unreadable stamp gives no time', () => {
    expect(BrainTextUtil.timeLeftText(null, READ_AT_MILLISECONDS)).toBeNull();
    expect(BrainTextUtil.runTimeText('not a time', READ_AT_MILLISECONDS)).toBeNull();
    expect(BrainTextUtil.spanText('2026-11-12T13:18:54.000Z', null)).toBeNull();
    expect(BrainTextUtil.clockTimeToTheSecondOf('not a time', 'UTC')).toBeNull();
  });

  test('a move\'s clock time is printed to the second in the page\'s time zone', () => {
    expect(BrainTextUtil.clockTimeToTheSecondOf('2026-11-12T13:19:28.000Z', 'UTC')).toBe('13:19:28');
    expect(BrainTextUtil.clockTimeToTheSecondOf('2026-11-12T13:19:28.000Z', 'Europe/Amsterdam')).toBe('14:19:28');
  });
});

describe('words and figures', () => {

  test('the four-bar mark knows low to max, and no other word', () => {
    expect(['low', 'medium', 'high', 'max', 'xhigh'].map((effort) => BrainTextUtil.effortLevelOf(effort))).toEqual([1, 2, 3, 4, null]);
  });

  test('who woke the brain is a place, and nobody is said when the forge does not say', () => {
    const places = (['gaia', 'bridge', null] as const).map((startedBy) => BrainTextUtil.startedByPlaceOf(startedBy));
    expect(places).toEqual(['from Gaia', 'from the Bridge', null]);
  });

  test('a move is what the brain chose, then how it showed it', () => {
    expect(BrainTextUtil.moveTextOf({ intent: 'visit Agents', emote: 'wave' })).toBe('visit Agents · wave');
    expect(BrainTextUtil.moveTextOf({ intent: 'read the board', emote: null })).toBe('read the board');
  });
});
