/**
 * How the page words a forge's state. What matters: every condition has its word and a dot, a restarting forge drawing the ring of one on
 * its way; a forge older than this Gaia shows `outdated`, apart from a newer one the server reads as unreadable alike; the usage line is
 * worded as the Bridge words it; and the unreachable callout's machine line names only what the document holds, so a value the
 * forge never reported is absent, not blank.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_FIVE_FORGES_READINGS }         from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS_READINGS }            from '../../testing/fixtures/fleet-versions.ts';
import { ForgeTextUtil, type ShownCondition } from './ForgeTextUtil.ts';

const EVERY_CONDITION: readonly ShownCondition[] = [
  'live',
  'paused',
  'held',
  'restarting',
  'starting',
  'dormant',
  'unreachable',
  'unreadable',
  'missing',
  'outdated',
];

describe('a forge\'s condition', () => {
  test('has a word for every condition', () => {
    expect(EVERY_CONDITION.map((condition) => ForgeTextUtil.conditionWordOf(condition))).toEqual([
      'live', 'paused', 'launches held', 'restarting', 'starting', 'dormant', 'unreachable', 'not readable', 'repository missing', 'needs update',
    ]);
  });

  test('leads a line or heads a cell in sentence case', () => {
    expect(EVERY_CONDITION.map((condition) => ForgeTextUtil.conditionWordInSentenceCaseOf(condition))).toEqual([
      'Live', 'Paused', 'Launches held', 'Restarting', 'Starting', 'Dormant', 'Unreachable', 'Not readable', 'Repository missing', 'Needs update',
    ]);
  });

  test('draws the dot of its own condition, and restarting draws the starting ring', () => {
    expect(EVERY_CONDITION.map((condition) => ForgeTextUtil.dotConditionOf(condition))).toEqual([
      'live', 'paused', 'held', 'starting', 'starting', 'dormant', 'unreachable', 'unreadable', 'missing', 'outdated',
    ]);
  });

  test('shows a forge older than this Gaia as outdated, and every other forge in the condition its document carries', () => {
    const readings = FLEET_VERSIONS_READINGS;
    const forges = [readings.exampleStorefront, readings.invoiceService, readings.exampleBilling, readings.analyticsSandbox, readings.exampleDocs];
    expect(forges.map((forge) => ForgeTextUtil.shownConditionOf(forge))).toEqual(['live', 'live', 'outdated', 'unreadable', 'outdated']);
    expect(ForgeTextUtil.shownConditionOf(FLEET_FIVE_FORGES_READINGS.designSystem)).toBe('dormant');
  });
});

describe('the usage line', () => {
  const clockTextOfStamp = (stamp: string): string => `clock of ${stamp}`;
  const NO_CURRENT_WINDOW = { currentWindow: null, currentWindowResetsAt: null };
  const CURRENT_WINDOW = { currentWindow: 'five_hour', currentWindowResetsAt: '2026-11-12T15:00:00.000Z' };

  test('says under its limit, and nothing of a window, while no window is hit and none is reported', () => {
    expect(ForgeTextUtil.usageTextOf({ window: null, resetsAt: null, ...NO_CURRENT_WINDOW }, clockTextOfStamp)).toBe('under its limit');
  });

  test('says under its limit and when the current window resets, by the caller\'s clock, while no window is hit', () => {
    expect(ForgeTextUtil.usageTextOf({ window: null, resetsAt: null, ...CURRENT_WINDOW }, clockTextOfStamp))
      .toBe('under its limit · window resets clock of 2026-11-12T15:00:00.000Z');
  });

  test('names the window that hit the limit and when it resets, by the caller\'s clock, whatever the current window', () => {
    expect(ForgeTextUtil.usageTextOf({ window: 'five-hour', resetsAt: '2026-11-12T16:00:00.000Z', ...CURRENT_WINDOW }, clockTextOfStamp))
      .toBe('five-hour limit hit · resets clock of 2026-11-12T16:00:00.000Z');
    expect(ForgeTextUtil.usageTextOf({ window: null, resetsAt: '2026-11-12T16:00:00.000Z', ...NO_CURRENT_WINDOW }, clockTextOfStamp))
      .toBe('limit hit · resets clock of 2026-11-12T16:00:00.000Z');
  });
});

describe('the callout of a Hephaestus that stopped answering', () => {
  const forge = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

  test('names the address without its scheme, the process and the last answer', () => {
    expect(ForgeTextUtil.unreachableCalloutTextOf({ ...forge, url: 'http://127.0.0.1:4801', processId: 4242 }, '13:02')).toEqual({
      word:        'Unreachable',
      sentence:    'Its Hephaestus stopped answering. The registry still names it.',
      machineLine: '127.0.0.1:4801 · process 4242 · last answer 13:02',
    });
  });

  test('leaves out what the document does not hold, and has no machine line when it holds none of it', () => {
    expect(ForgeTextUtil.unreachableCalloutTextOf({ ...forge, url: 'http://127.0.0.1:4801', processId: null }, null).machineLine).toBe('127.0.0.1:4801');
    expect(ForgeTextUtil.unreachableCalloutTextOf({ ...forge, url: null, processId: null }, null).machineLine).toBeNull();
  });
});

describe('a forge that crashed, is down or hung', () => {
  const STOREFRONT = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

  test('shows how it is present in place of its condition, in words, beside the dot of a forge that does not answer', () => {
    const shown = (['crashed', 'down', 'hung'] as const).map((state) => ForgeTextUtil.shownConditionOf({ ...STOREFRONT, presence: { state, generation: 1, at: null } }));
    expect(shown).toEqual(['crashed', 'down', 'hung']);
    expect(shown.map((condition) => [ForgeTextUtil.conditionWordOf(condition), ForgeTextUtil.dotConditionOf(condition)])).toEqual([
      ['crashed', 'unreachable'],
      ['down', 'unreachable'],
      ['stopped supervising', 'unreachable'],
    ]);
  });

  test('shows its own condition while it serves, stopped or handed over', () => {
    for (const state of ['serving', 'stopped', 'handed-over', 'unknown'] as const) {
      expect(ForgeTextUtil.shownConditionOf({ ...STOREFRONT, presence: { state, generation: 1, at: null } })).toBe(STOREFRONT.condition);
    }
  });
});
