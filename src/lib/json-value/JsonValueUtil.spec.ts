/**
 * The JSON reading helpers hold the cases a hand-written reader gets wrong: text that is no JSON answers null rather than throwing, a parsed
 * `null` stays apart from a failed parse, an array or `null` is no JSON object, and an inherited key reads as absent.
 */
import { describe, expect, test } from 'bun:test';

import { JsonValueUtil } from './JsonValueUtil.ts';

describe('parsedValueOf', () => {
  test('answers the parsed value of JSON text', () => {
    expect(JsonValueUtil.parsedValueOf('{"version":1}')).toEqual({ parsed: { version: 1 } });
  });

  test('keeps a parsed null apart from text that is no JSON', () => {
    expect(JsonValueUtil.parsedValueOf('null')).toEqual({ parsed: null });
    expect(JsonValueUtil.parsedValueOf('{not json')).toBeNull();
  });
});

describe('jsonObjectOf', () => {
  test('answers a plain object as itself', () => {
    const record = { theme: 'dark' };
    expect(JsonValueUtil.jsonObjectOf(record)).toBe(record);
    expect(JsonValueUtil.isJsonObject(record)).toBe(true);
  });

  test('answers null for an array, null and every other value', () => {
    for (const value of [[], null, undefined, 'text', 1, true]) {
      expect(JsonValueUtil.jsonObjectOf(value)).toBeNull();
      expect(JsonValueUtil.isJsonObject(value)).toBe(false);
    }
  });
});

describe('ownValueOf', () => {
  test('answers the value of a key the object holds as its own', () => {
    expect(JsonValueUtil.ownValueOf({ version: 1 }, 'version')).toBe(1);
  });

  test('answers undefined for an inherited key and a missing one', () => {
    expect(JsonValueUtil.ownValueOf({}, 'constructor')).toBeUndefined();
    expect(JsonValueUtil.ownValueOf({}, 'toString')).toBeUndefined();
    expect(JsonValueUtil.ownValueOf({ version: 1 }, 'theme')).toBeUndefined();
  });
});
