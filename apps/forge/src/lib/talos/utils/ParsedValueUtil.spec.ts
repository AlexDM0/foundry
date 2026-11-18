/**
 * The shared checks under every Talos frame and record: only own keys count, whole numbers are safe integers, an identity is the current
 * shape or `null`, and a stored text names another format before any field is read, never throwing on text that is no JSON.
 */
import { describe, expect, test } from 'bun:test';

import { ParsedValueUtil } from './ParsedValueUtil.ts';

const IDENTITY = { processId: 4242, startStamp: '1790000000', bootIdentity: 'example-boot' };

test('reads only a key the value holds itself', () => {
  expect(ParsedValueUtil.ownFieldOf({ kind: 'line' }, 'kind')).toBe('line');
  expect(ParsedValueUtil.ownFieldOf({}, 'toString')).toBeUndefined();
});

test.each([[3, 1, true], [1, 1, true], [0, 1, false], [1.5, 0, false], [Number.MAX_SAFE_INTEGER + 1, 0, false], ['3', 0, false]])(
  'isWholeNumberAtLeast(%p, %p) is %p',
  (value, least, expected) => {
    expect(ParsedValueUtil.isWholeNumberAtLeast(value, least)).toBe(expected);
  },
);

test('a string record holds strings only', () => {
  expect(ParsedValueUtil.isStringRecord({ PATH: '/usr/bin' })).toBe(true);
  expect(ParsedValueUtil.isStringRecord({ COUNT: 1 })).toBe(false);
  expect(ParsedValueUtil.isStringRecord(['/usr/bin'])).toBe(false);
});

test('one of a list of values', () => {
  expect(ParsedValueUtil.isOneOf('line', ['agent', 'line'])).toBe(true);
  expect(ParsedValueUtil.isOneOf('process', ['agent', 'line'])).toBe(false);
});

test('an identity reads in the current shape only; null stays null', () => {
  expect(ParsedValueUtil.identityOrNullOf(IDENTITY)).toEqual(IDENTITY);
  expect(ParsedValueUtil.identityOrNullOf(null)).toBeNull();
  expect(ParsedValueUtil.identityOrNullOf({ processId: 4242, startEpochSeconds: 1790000000, bootIdentity: 'example-boot' })).toBeUndefined();
  expect(ParsedValueUtil.identityOrNullOf('4242')).toBeUndefined();
});

test('a stored text is two-space JSON with a final line feed', () => {
  expect(ParsedValueUtil.storedTextOf({ formatVersion: 1 })).toBe('{\n  "formatVersion": 1\n}\n');
});

describe('parsedObjectOf', () => {
  test('answers the object of the format asked for', () => {
    expect(ParsedValueUtil.parsedObjectOf('{"formatVersion":1,"kind":"line"}', 1)).toEqual({ verdict: 'object', parsed: { formatVersion: 1, kind: 'line' } });
  });

  test('names another format', () => {
    expect(ParsedValueUtil.parsedObjectOf('{"formatVersion":4}', 1)).toEqual({ verdict: 'other-format', formatVersion: 4 });
  });

  test.each([['no JSON', '{"formatVersion":'], ['a list', '[1]'], ['no format version', '{}'], ['a fractional format version', '{"formatVersion":1.5}']])(
    '%s reads unreadable',
    (_title, text) => {
      expect(ParsedValueUtil.parsedObjectOf(text, 1).verdict).toBe('unreadable');
    },
  );
});
