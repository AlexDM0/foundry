/**
 * Ending recognition per child: counted lines are counted between two closing lines and reset at each, a closing line that meets no pattern
 * still resets, the minimum count holds a match back, the first matching pattern wins, and a free text that names a failure never stands
 * in for the field a pattern names. The field names are synthetic: recognition knows no vendor.
 */
import { describe, expect, test } from 'bun:test';

import { createEndingRecognition, type EndingPattern, endingPatternOf } from './EndingPatterns.ts';
import { type LineConditions, parsedLineOf }                            from './LineConditions.ts';

const CLOSING_LINE: LineConditions = { allOf: [{ test: 'equals', path: 'kind', value: 'finished' }], anyOf: [], noneOf: [] };

const UNREACHABLE_PATTERN: EndingPattern = {
  name:               'unreachable-host',
  closingLineMatches: {
    allOf: [{ test: 'equals', path: 'kind', value: 'finished' }, { test: 'equals', path: 'failed', value: true }],
    anyOf: [{ test: 'equals', path: 'failure', value: 'unreachable' }, {
      test: 'number-between', path: 'status', least: 500, most: 599
    }],
    noneOf: [],
  },
  countedLineMatches:  { allOf: [{ test: 'equals', path: 'kind', value: 'retrying' }], anyOf: [], noneOf: [] },
  minimumCountedLines: 1,
};

const ANY_FAILURE_PATTERN: EndingPattern = {
  name:                'any-failure',
  closingLineMatches:  { allOf: [{ test: 'equals', path: 'failed', value: true }], anyOf: [], noneOf: [] },
  countedLineMatches:  null,
  minimumCountedLines: 0,
};

const RETRYING_LINE = '{"kind":"retrying","attempt":1}';
const UNREACHABLE_CLOSING_LINE = '{"kind":"finished","failed":true,"failure":"unreachable"}';
const SUCCEEDED_CLOSING_LINE = '{"kind":"finished","failed":false}';

/** Feeds the lines from sequence 1 on and answers what each one recognised. */
function recognitionsOf(lines: readonly string[], patterns: readonly EndingPattern[], closingLine: LineConditions | null = CLOSING_LINE): unknown[] {
  const recognition = createEndingRecognition(closingLine, patterns);
  return lines.map((line, i) => recognition.observe(parsedLineOf(line), i + 1));
}

describe('createEndingRecognition', () => {
  test('counts the lines before a closing line and names the ending with that count', () => {
    expect(recognitionsOf([RETRYING_LINE, '{"kind":"progress"}', RETRYING_LINE, UNREACHABLE_CLOSING_LINE], [UNREACHABLE_PATTERN])).toEqual([
      null,
      null,
      null,
      { name: 'unreachable-host', closingLineSequence: 4, countedLines: 2 },
    ]);
  });

  test('resets the counts at a closing line that matched', () => {
    expect(recognitionsOf([RETRYING_LINE, UNREACHABLE_CLOSING_LINE, UNREACHABLE_CLOSING_LINE], [UNREACHABLE_PATTERN])).toEqual([
      null,
      { name: 'unreachable-host', closingLineSequence: 2, countedLines: 1 },
      null,
    ]);
  });

  test('a closing line that meets no pattern answers null and still resets the counts', () => {
    expect(recognitionsOf([RETRYING_LINE, SUCCEEDED_CLOSING_LINE, UNREACHABLE_CLOSING_LINE], [UNREACHABLE_PATTERN])).toEqual([null, null, null]);
  });

  test('the minimum count holds back a match below it', () => {
    expect(recognitionsOf([UNREACHABLE_CLOSING_LINE], [UNREACHABLE_PATTERN])).toEqual([null]);
    const twoRetriesNeeded: EndingPattern = { ...UNREACHABLE_PATTERN, minimumCountedLines: 2 };
    expect(recognitionsOf([RETRYING_LINE, UNREACHABLE_CLOSING_LINE], [twoRetriesNeeded])).toEqual([null, null]);
    expect(recognitionsOf([RETRYING_LINE, RETRYING_LINE, UNREACHABLE_CLOSING_LINE], [twoRetriesNeeded])[2])
      .toEqual({ name: 'unreachable-host', closingLineSequence: 3, countedLines: 2 });
  });

  test('the first pattern that matches wins, and a later one answers when an earlier is held back', () => {
    expect(recognitionsOf([RETRYING_LINE, UNREACHABLE_CLOSING_LINE], [UNREACHABLE_PATTERN, ANY_FAILURE_PATTERN])[1])
      .toEqual({ name: 'unreachable-host', closingLineSequence: 2, countedLines: 1 });
    expect(recognitionsOf([RETRYING_LINE, UNREACHABLE_CLOSING_LINE], [ANY_FAILURE_PATTERN, UNREACHABLE_PATTERN])[1])
      .toEqual({ name: 'any-failure', closingLineSequence: 2, countedLines: 0 });
    expect(recognitionsOf([UNREACHABLE_CLOSING_LINE], [UNREACHABLE_PATTERN, ANY_FAILURE_PATTERN]))
      .toEqual([{ name: 'any-failure', closingLineSequence: 1, countedLines: 0 }]);
  });

  test('a line that is no JSON object counts for nothing', () => {
    expect(recognitionsOf(['retrying', '["kind","retrying"]', UNREACHABLE_CLOSING_LINE], [UNREACHABLE_PATTERN])).toEqual([null, null, null]);
  });

  test('a free text that names the failure never meets a condition on the failure field', () => {
    const imitatedClosingLine = '{"kind":"finished","failed":true,"summary":"connection failed: unreachable, status 529"}';
    expect(recognitionsOf([RETRYING_LINE, imitatedClosingLine], [UNREACHABLE_PATTERN])).toEqual([null, null]);
  });

  test('with no closing line nothing is recognised', () => {
    expect(recognitionsOf([RETRYING_LINE, UNREACHABLE_CLOSING_LINE], [UNREACHABLE_PATTERN], null)).toEqual([null, null]);
  });
});

describe('endingPatternOf', () => {
  test('accepts a well-formed pattern, a null counted condition included', () => {
    expect(endingPatternOf(UNREACHABLE_PATTERN)).toEqual(UNREACHABLE_PATTERN);
    expect(endingPatternOf(ANY_FAILURE_PATTERN)).toEqual(ANY_FAILURE_PATTERN);
  });

  test('refuses a malformed name', () => {
    for (const name of ['', 'Unreachable', '-unreachable', 'unreachable_host', 'unreachable host', 7]) {
      expect(endingPatternOf({ ...UNREACHABLE_PATTERN, name })).toBeNull();
    }
  });

  test('refuses a malformed minimum count', () => {
    for (const minimumCountedLines of [-1, 1.5, '1', null]) {
      expect(endingPatternOf({ ...UNREACHABLE_PATTERN, minimumCountedLines })).toBeNull();
    }
  });

  test('refuses malformed or missing closing and counted conditions', () => {
    expect(endingPatternOf({ ...UNREACHABLE_PATTERN, closingLineMatches: null })).toBeNull();
    expect(endingPatternOf({ ...UNREACHABLE_PATTERN, countedLineMatches: { allOf: [] } })).toBeNull();
    const { countedLineMatches: _droppedCountedLineMatches, ...withoutCountedLineMatches } = UNREACHABLE_PATTERN;
    expect(endingPatternOf(withoutCountedLineMatches)).toBeNull();
    expect(endingPatternOf(null)).toBeNull();
  });
});
