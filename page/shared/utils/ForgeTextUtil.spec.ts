/**
 * How the page words a forge's state. What matters: every condition has its word and a dot, a forge passing the baton drawing the ring of
 * one on its way; the usage line is worded as the Bridge words it; and the unreachable callout's machine line names only what the document
 * holds, so a value the forge never reported is absent, not blank.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocumentCondition } from '../../@types/FleetDocument.ts';
import { FLEET_FIVE_FORGES_READINGS }  from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgeTextUtil }               from './ForgeTextUtil.ts';

const EVERY_CONDITION: readonly FleetDocumentCondition[] = ['live', 'paused', 'held', 'passing-baton', 'starting', 'dormant', 'unreachable', 'unreadable', 'missing'];

describe('a forge\'s condition', () => {
  test('has a word for every condition', () => {
    expect(EVERY_CONDITION.map((condition) => ForgeTextUtil.conditionWordOf(condition))).toEqual([
      'live', 'paused', 'launches held', 'passing the baton', 'starting', 'dormant', 'unreachable', 'not readable', 'repository missing',
    ]);
  });

  test('leads a line or heads a cell in sentence case', () => {
    expect(EVERY_CONDITION.map((condition) => ForgeTextUtil.conditionWordInSentenceCaseOf(condition))).toEqual([
      'Live', 'Paused', 'Launches held', 'Passing the baton', 'Starting', 'Dormant', 'Unreachable', 'Not readable', 'Repository missing',
    ]);
  });

  test('draws the dot of its own condition, and passing the baton draws the starting ring', () => {
    expect(EVERY_CONDITION.map((condition) => ForgeTextUtil.dotConditionOf(condition))).toEqual([
      'live', 'paused', 'held', 'starting', 'starting', 'dormant', 'unreachable', 'unreadable', 'missing',
    ]);
  });
});

describe('the usage line', () => {
  const clockTextOfStamp = (stamp: string): string => `clock of ${stamp}`;

  test('says under its limit while no window is hit', () => {
    expect(ForgeTextUtil.usageTextOf({ window: null, resetsAt: null }, clockTextOfStamp)).toBe('under its limit');
  });

  test('names the window that hit the limit and when it resets, by the caller\'s clock', () => {
    expect(ForgeTextUtil.usageTextOf({ window: 'five-hour', resetsAt: '2026-11-12T16:00:00.000Z' }, clockTextOfStamp))
      .toBe('five-hour limit hit · resets clock of 2026-11-12T16:00:00.000Z');
    expect(ForgeTextUtil.usageTextOf({ window: null, resetsAt: '2026-11-12T16:00:00.000Z' }, clockTextOfStamp))
      .toBe('limit hit · resets clock of 2026-11-12T16:00:00.000Z');
  });
});

describe('the callout of an Overseer that stopped answering', () => {
  const forge = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

  test('names the address without its scheme, the process and the last answer', () => {
    expect(ForgeTextUtil.unreachableCalloutTextOf({ ...forge, url: 'http://127.0.0.1:4801', processId: 4242 }, '13:02')).toEqual({
      word:        'Unreachable',
      sentence:    'Its Overseer stopped answering. The registry still names it.',
      machineLine: '127.0.0.1:4801 · process 4242 · last answer 13:02',
    });
  });

  test('leaves out what the document does not hold, and has no machine line when it holds none of it', () => {
    expect(ForgeTextUtil.unreachableCalloutTextOf({ ...forge, url: 'http://127.0.0.1:4801', processId: null }, null).machineLine).toBe('127.0.0.1:4801');
    expect(ForgeTextUtil.unreachableCalloutTextOf({ ...forge, url: null, processId: null }, null).machineLine).toBeNull();
  });
});
