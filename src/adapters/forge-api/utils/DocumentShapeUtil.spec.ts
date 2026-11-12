/**
 * The shape check against its own contract: every key that is missing or fails its rule is named as a path, in the shape's order; an
 * optional key may be absent and a nullable one `null`, and nothing else; a document that is no object names every key it requires; and a
 * key is read only as the document's own.
 */
import { describe, expect, test } from 'bun:test';

import { DocumentShapeUtil, type DocumentShape } from './DocumentShapeUtil.ts';

const ENTRY_SHAPE: DocumentShape = { id: 'text', size: 'whole-number' };

const SHAPE: DocumentShape = {
  name:     'text',
  count:    'whole-number',
  enabled:  'boolean',
  tags:     'text-list',
  colour:   { oneOf: ['red', 'green'] },
  note:     { nullable: 'text' },
  extra:    { optional: 'whole-number' },
  inner:    { object: { deep: 'text' } },
  entries:  { listOf: ENTRY_SHAPE },
  sometime: { optional: { nullable: { object: { deep: 'text' } } } },
};

function wholeDocument(): Record<string, unknown> {
  return {
    name:    'Example Agency',
    count:   3,
    enabled: true,
    tags:    ['one', 'two'],
    colour:  'red',
    note:    null,
    inner:   { deep: 'value' },
    entries: [{ id: 'first', size: 0 }],
  };
}

describe('invalidKeysOf', () => {
  test('names no key of a document that holds the shape, its optional keys absent', () => {
    expect(DocumentShapeUtil.invalidKeysOf(wholeDocument(), SHAPE)).toEqual([]);
    expect(DocumentShapeUtil.invalidKeysOf({ ...wholeDocument(), extra: 2, sometime: null }, SHAPE)).toEqual([]);
  });

  test('names every key that fails its rule, nested keys and list items as paths, in the shape\'s order', () => {
    const broken = {
      name:     7,
      count:    -1,
      enabled:  'true',
      tags:     ['one', 2],
      colour:   'blue',
      note:     undefined,
      extra:    null,
      inner:    { deep: null },
      entries:  [{ id: 'first', size: 1.5 }, 'second'],
      sometime: { deep: 4 },
    };
    expect(DocumentShapeUtil.invalidKeysOf(broken, SHAPE)).toEqual([
      'name',
      'count',
      'enabled',
      'tags',
      'colour',
      'note',
      'extra',
      'inner.deep',
      'entries[0].size',
      'entries[1]',
      'sometime.deep',
    ]);
  });

  test('names a list or an object that is something else', () => {
    expect(DocumentShapeUtil.invalidKeysOf({ ...wholeDocument(), inner: [], entries: {} }, SHAPE)).toEqual(['inner', 'entries']);
  });

  test('names every required key of a document that is no object', () => {
    const requiredKeys = ['name', 'count', 'enabled', 'tags', 'colour', 'note', 'inner', 'entries'];
    for (const document of [null, [], 'document', 4]) expect(DocumentShapeUtil.invalidKeysOf(document, SHAPE)).toEqual(requiredKeys);
  });

  test('reads no key through the prototype', () => {
    const inheritsName = Object.assign(Object.create({ name: 'Example Agency' }) as Record<string, unknown>, wholeDocument());
    delete inheritsName['name'];
    expect(DocumentShapeUtil.invalidKeysOf(inheritsName, SHAPE)).toEqual(['name']);
  });
});

describe('topLevelValueOf', () => {
  test('answers the document\'s own value, and undefined for an absent key, an inherited one or a document that is no object', () => {
    expect(DocumentShapeUtil.topLevelValueOf({ monitorVersion: 1 }, 'monitorVersion')).toBe(1);
    expect(DocumentShapeUtil.topLevelValueOf({}, 'monitorVersion')).toBeUndefined();
    expect(DocumentShapeUtil.topLevelValueOf(Object.create({ monitorVersion: 1 }), 'monitorVersion')).toBeUndefined();
    expect(DocumentShapeUtil.topLevelValueOf(['monitorVersion'], '0')).toBeUndefined();
  });
});

describe('isWholeNumber', () => {
  test('holds for a safe integer of zero or more and for nothing else', () => {
    expect([0, 7, Number.MAX_SAFE_INTEGER].map(DocumentShapeUtil.isWholeNumber)).toEqual([true, true, true]);
    expect([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null].map(DocumentShapeUtil.isWholeNumber)).toEqual([false, false, false, false, false, false]);
  });
});
