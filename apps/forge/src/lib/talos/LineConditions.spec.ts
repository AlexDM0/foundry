/**
 * The line matcher as pure data rules: each test kind on its boundaries, numbers never confused with their text, a missing or inherited
 * path never read as a value, and the launch validator refusing every malformed field. The field names are synthetic: the matcher knows
 * no vendor.
 */
import { describe, expect, test } from 'bun:test';

import {
  type FieldCondition,
  type LineConditions,
  lineConditionsOf,
  lineMeets,
  parsedLineOf,
} from './LineConditions.ts';

function conditionsOf(allOf: readonly FieldCondition[], anyOf: readonly FieldCondition[] = [], noneOf: readonly FieldCondition[] = []): LineConditions {
  return { allOf, anyOf, noneOf };
}

function meets(line: string, conditions: LineConditions): boolean {
  const parsed = parsedLineOf(line);
  if (parsed === null) throw new Error(`the planted line ${line} is no JSON object`);
  return lineMeets(parsed, conditions);
}

describe('parsedLineOf', () => {
  test('reads a JSON object and nothing else', () => {
    expect(parsedLineOf('{"kind":"finished"}')).toEqual({ kind: 'finished' });
    expect(parsedLineOf('["finished"]')).toBeNull();
    expect(parsedLineOf('null')).toBeNull();
    expect(parsedLineOf('7')).toBeNull();
    expect(parsedLineOf('plain text')).toBeNull();
  });
});

describe('lineMeets', () => {
  const STATUS_BETWEEN = conditionsOf([{
    test: 'number-between', path: 'failure.status', least: 500, most: 599
  }]);

  test('number-between holds on its least and its most and fails one past each', () => {
    expect(meets('{"failure":{"status":500}}', STATUS_BETWEEN)).toBe(true);
    expect(meets('{"failure":{"status":599}}', STATUS_BETWEEN)).toBe(true);
    expect(meets('{"failure":{"status":499}}', STATUS_BETWEEN)).toBe(false);
    expect(meets('{"failure":{"status":600}}', STATUS_BETWEEN)).toBe(false);
  });

  test('a number given as a string never meets number-between and never equals the number', () => {
    expect(meets('{"failure":{"status":"529"}}', STATUS_BETWEEN)).toBe(false);
    expect(meets('{"failure":{"status":"529"}}', conditionsOf([{ test: 'equals', path: 'failure.status', value: 529 }]))).toBe(false);
    expect(meets('{"failure":{"status":529}}', conditionsOf([{ test: 'equals', path: 'failure.status', value: 529 }]))).toBe(true);
  });

  test('equals compares strictly, booleans and null included', () => {
    expect(meets('{"failed":true}', conditionsOf([{ test: 'equals', path: 'failed', value: true }]))).toBe(true);
    expect(meets('{"failed":"true"}', conditionsOf([{ test: 'equals', path: 'failed', value: true }]))).toBe(false);
    expect(meets('{"status":null}', conditionsOf([{ test: 'equals', path: 'status', value: null }]))).toBe(true);
    expect(meets('{"status":0}', conditionsOf([{ test: 'equals', path: 'status', value: null }]))).toBe(false);
  });

  test('one-of holds for a listed value and fails for any other', () => {
    const KIND_ONE_OF = conditionsOf([{ test: 'one-of', path: 'kind', values: ['finished', 'stopped'] }]);
    expect(meets('{"kind":"stopped"}', KIND_ONE_OF)).toBe(true);
    expect(meets('{"kind":"started"}', KIND_ONE_OF)).toBe(false);
  });

  test('a missing path fails equals, one-of and number-between, also against null', () => {
    expect(meets('{}', conditionsOf([{ test: 'equals', path: 'status', value: null }]))).toBe(false);
    expect(meets('{"failure":"flat"}', conditionsOf([{ test: 'equals', path: 'failure.kind', value: 'unreachable' }]))).toBe(false);
    expect(meets('{}', conditionsOf([{ test: 'one-of', path: 'kind', values: ['finished'] }]))).toBe(false);
    expect(meets('{}', STATUS_BETWEEN)).toBe(false);
  });

  test('an inherited property is never read', () => {
    expect(meets('{}', conditionsOf([{ test: 'equals', path: 'constructor.name', value: 'Object' }]))).toBe(false);
    expect(meets('{}', conditionsOf([{ test: 'equals', path: '__proto__.constructor.name', value: 'Object' }]))).toBe(false);
    expect(meets('{"kind":"finished"}', conditionsOf([{ test: 'equals', path: 'kind.length', value: 8 }]))).toBe(false);
  });

  test('allOf must all hold, noneOf must all fail, and anyOf holds when empty or when one of it holds', () => {
    const conditions = conditionsOf(
      [{ test: 'equals', path: 'kind', value: 'finished' }],
      [{ test: 'equals', path: 'failure', value: 'unreachable' }, {
        test: 'number-between', path: 'status', least: 500, most: 599
      }],
      [{ test: 'equals', path: 'planted', value: true }],
    );
    expect(meets('{"kind":"finished","failure":"unreachable"}', conditions)).toBe(true);
    expect(meets('{"kind":"finished","status":529}', conditions)).toBe(true);
    expect(meets('{"kind":"finished","status":429}', conditions)).toBe(false);
    expect(meets('{"kind":"finished","status":529,"planted":true}', conditions)).toBe(false);
    expect(meets('{"kind":"started","status":529}', conditions)).toBe(false);
    expect(meets('{"kind":"finished"}', conditionsOf([{ test: 'equals', path: 'kind', value: 'finished' }]))).toBe(true);
  });
});

describe('lineConditionsOf', () => {
  const WELL_FORMED = {
    allOf:  [{ test: 'equals', path: 'kind', value: 'finished' }],
    anyOf:  [{ test: 'one-of', path: 'failure', values: ['unreachable', 503, true] }],
    noneOf: [{
      test: 'number-between', path: 'status', least: 400, most: 499
    }],
  };

  function withField(listName: 'allOf' | 'anyOf' | 'noneOf', condition: unknown): unknown {
    return { ...WELL_FORMED, [listName]: [condition] };
  }

  test('accepts well-formed conditions and returns only their known fields', () => {
    expect(lineConditionsOf({ ...WELL_FORMED, planted: 'extra' })).toEqual(WELL_FORMED as LineConditions);
    expect(lineConditionsOf({ allOf: [], anyOf: [], noneOf: [] })).toEqual({ allOf: [], anyOf: [], noneOf: [] });
    expect(lineConditionsOf(withField('allOf', { test: 'equals', path: 'status', value: null }))).not.toBeNull();
  });

  test('refuses conditions that are no object or lack a list', () => {
    expect(lineConditionsOf(null)).toBeNull();
    expect(lineConditionsOf([])).toBeNull();
    expect(lineConditionsOf({ allOf: [], anyOf: [] })).toBeNull();
    expect(lineConditionsOf({ allOf: [], anyOf: {}, noneOf: [] })).toBeNull();
  });

  test('refuses a malformed test', () => {
    expect(lineConditionsOf(withField('allOf', { test: 'contains', path: 'summary', value: 'failed' }))).toBeNull();
    expect(lineConditionsOf(withField('allOf', { path: 'kind', value: 'finished' }))).toBeNull();
    expect(lineConditionsOf(withField('allOf', 'kind'))).toBeNull();
  });

  test('refuses a malformed path', () => {
    expect(lineConditionsOf(withField('anyOf', { test: 'equals', path: '', value: 'finished' }))).toBeNull();
    expect(lineConditionsOf(withField('anyOf', { test: 'equals', path: 7, value: 'finished' }))).toBeNull();
    expect(lineConditionsOf(withField('anyOf', { test: 'equals', value: 'finished' }))).toBeNull();
  });

  test('refuses a malformed value', () => {
    expect(lineConditionsOf(withField('noneOf', { test: 'equals', path: 'kind' }))).toBeNull();
    expect(lineConditionsOf(withField('noneOf', { test: 'equals', path: 'kind', value: { nested: true } }))).toBeNull();
    expect(lineConditionsOf(withField('noneOf', { test: 'equals', path: 'kind', value: ['finished'] }))).toBeNull();
  });

  test('refuses malformed values', () => {
    expect(lineConditionsOf(withField('anyOf', { test: 'one-of', path: 'kind' }))).toBeNull();
    expect(lineConditionsOf(withField('anyOf', { test: 'one-of', path: 'kind', values: 'finished' }))).toBeNull();
    expect(lineConditionsOf(withField('anyOf', { test: 'one-of', path: 'kind', values: ['finished', null] }))).toBeNull();
  });

  test('refuses a malformed least or most, and a least above its most', () => {
    expect(lineConditionsOf(withField('allOf', { test: 'number-between', path: 'status', most: 599 }))).toBeNull();
    expect(lineConditionsOf(withField('allOf', {
      test: 'number-between', path: 'status', least: '500', most: 599
    }))).toBeNull();
    expect(lineConditionsOf(withField('allOf', { test: 'number-between', path: 'status', least: 500 }))).toBeNull();
    expect(lineConditionsOf(withField('allOf', {
      test: 'number-between', path: 'status', least: 500, most: '599'
    }))).toBeNull();
    expect(lineConditionsOf(withField('allOf', {
      test: 'number-between', path: 'status', least: 600, most: 599
    }))).toBeNull();
    expect(lineConditionsOf(withField('allOf', {
      test: 'number-between', path: 'status', least: 599, most: 599
    }))).not.toBeNull();
  });
});
