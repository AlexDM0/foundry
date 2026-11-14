/**
 * How a forge's stamp prints. What matters: the ages of artboard A1 come out of the fixtures' stamps at the clock the artboard was drawn
 * at; an age is minutes alone under an hour and two units above it; a stamp ahead of the clock or one that does not parse prints no wrong
 * time; a clock time carries its month and day only when it is from another day than the clock's, in the time zone handed in; the time
 * left until a brain's end is A2's `1:24` at the fixtures' clock and stops at `0:00`, since the page decides nothing from it.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { StampTextUtil }          from './StampTextUtil.ts';

const READ_AT = Date.parse(FLEET_FIXTURES_READ_AT);

describe('the age of a stamp', () => {
  test('gives the ages artboard A1 shows for its five rows', () => {
    const stamps = ['2026-11-12T12:58:10.000Z', '2026-11-12T11:15:10.000Z', '2026-11-12T12:53:10.000Z', '2026-11-12T13:07:10.000Z', '2026-11-12T13:15:10.000Z'];
    expect(stamps.map((stamp) => StampTextUtil.ageTextOf(stamp, READ_AT))).toEqual(['21m', '2h 04m', '26m', '12m', '4m']);
  });

  test('counts days and their hours past a day, and reads under a minute for a stamp in the last minute or ahead of the clock', () => {
    expect(StampTextUtil.ageTextOf('2026-11-09T08:00:00.000Z', READ_AT)).toBe('3d 05h');
    expect(StampTextUtil.ageTextOf('2026-11-12T13:19:00.000Z', READ_AT)).toBe('<1m');
    expect(StampTextUtil.ageTextOf('2026-11-12T13:25:00.000Z', READ_AT)).toBe('<1m');
  });

  test('prints nothing for a stamp that does not parse', () => {
    expect(StampTextUtil.ageTextOf('yesterday', READ_AT)).toBeNull();
  });
});

describe('the clock time of a stamp', () => {
  test('is the hour and minute in the time zone handed in', () => {
    expect(StampTextUtil.clockTextOf('2026-11-12T13:14:05.000Z', READ_AT, 'UTC')).toBe('13:14');
    expect(StampTextUtil.clockTextOf('2026-11-12T13:14:05.000Z', READ_AT, 'Europe/Amsterdam')).toBe('14:14');
  });

  test('gains its month and day when it is from another day than the clock\'s', () => {
    expect(StampTextUtil.clockTextOf('2026-09-03T17:40:00.000Z', READ_AT, 'UTC')).toBe('09-03 17:40');
    expect(StampTextUtil.clockTextOf('2026-11-12T23:30:00.000Z', Date.parse('2026-11-12T22:00:00.000Z'), 'Europe/Amsterdam')).toBe('11-13 00:30');
  });

  test('prints nothing for a stamp that does not parse', () => {
    expect(StampTextUtil.clockTextOf('', READ_AT, 'UTC')).toBeNull();
  });
});

describe('whether a stamp is of the clock\'s day', () => {
  test('holds for a stamp of the same calendar day in the time zone handed in, and not for the day before', () => {
    expect(StampTextUtil.stampIsOfTheClocksDay('2026-11-12T00:10:00.000Z', READ_AT, 'UTC')).toBe(true);
    expect(StampTextUtil.stampIsOfTheClocksDay('2026-11-11T23:50:00.000Z', READ_AT, 'UTC')).toBe(false);
    expect(StampTextUtil.stampIsOfTheClocksDay('2026-11-11T23:50:00.000Z', READ_AT, 'Europe/Amsterdam')).toBe(true);
  });

  test('does not hold for a stamp that does not parse', () => {
    expect(StampTextUtil.stampIsOfTheClocksDay('today', READ_AT, 'UTC')).toBe(false);
  });
});

describe('the time left until a stamp', () => {
  test('is the 1:24 that A2 shows for the fixtures\' brain, in whole seconds', () => {
    expect(StampTextUtil.countdownTextOf('2026-11-12T13:20:54.000Z', READ_AT)).toBe('1:24');
    expect(StampTextUtil.countdownTextOf('2026-11-12T13:20:54.900Z', READ_AT)).toBe('1:24');
    expect(StampTextUtil.countdownTextOf('2026-11-12T13:19:35.000Z', READ_AT)).toBe('0:05');
  });

  test('stops at 0:00 once the stamp has passed, and prints nothing for a stamp that does not parse', () => {
    expect(StampTextUtil.countdownTextOf('2026-11-12T13:19:00.000Z', READ_AT)).toBe('0:00');
    expect(StampTextUtil.countdownTextOf('soon', READ_AT)).toBeNull();
  });
});
