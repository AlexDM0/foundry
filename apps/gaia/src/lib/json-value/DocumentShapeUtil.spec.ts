/**
 * The shape check against its own contract: every missing or failing key is named as a path in the shape's order, optional and nullable allow only
 * absence and `null`, only own keys are read, and lists, records and one-of-several shapes are checked item by item.
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

  test('passes over a key the reader names but does not read, present or absent, and takes any present value as JSON', () => {
    const shape: DocumentShape = { skipped: 'passed-over', anything: 'json' };
    expect(DocumentShapeUtil.invalidKeysOf({ skipped: { deep: [1] }, anything: null }, shape)).toEqual([]);
    expect(DocumentShapeUtil.invalidKeysOf({ anything: 0 }, shape)).toEqual([]);
    expect(DocumentShapeUtil.invalidKeysOf({ skipped: 1 }, shape)).toEqual(['anything']);
  });

  test('takes any finite number as a number, and nothing else', () => {
    const shape: DocumentShape = { share: 'number' };
    expect(DocumentShapeUtil.invalidKeysOf({ share: 0.6 }, shape)).toEqual([]);
    expect(DocumentShapeUtil.invalidKeysOf({ share: -2 }, shape)).toEqual([]);
    for (const share of [Number.POSITIVE_INFINITY, Number.NaN, '0.6']) expect(DocumentShapeUtil.invalidKeysOf({ share }, shape)).toEqual(['share']);
  });

  test('names each item of a list and each value of a record that fails the rule, by its index or key', () => {
    const shape: DocumentShape = { numbers: { eachOf: 'whole-number' }, counts: { recordOf: 'whole-number' } };
    expect(DocumentShapeUtil.invalidKeysOf({ numbers: [1, 2], counts: { web: 1, api: 0 } }, shape)).toEqual([]);
    expect(DocumentShapeUtil.invalidKeysOf({ numbers: [1, 'two'], counts: { web: 1, api: 'none' } }, shape)).toEqual(['numbers[1]', 'counts.api']);
    expect(DocumentShapeUtil.invalidKeysOf({ numbers: {}, counts: [] }, shape)).toEqual(['numbers', 'counts']);
  });

  test('takes an object that fits any one of its shapes, and names the key of one that fits none', () => {
    const shape: DocumentShape = { step: { anyShapeOf: [{ kind: { oneOf: ['build'] }, attempt: 'whole-number' }, { kind: { oneOf: ['land'] }, target: { nullable: 'text' } }] }, };
    expect(DocumentShapeUtil.invalidKeysOf({ step: { kind: 'build', attempt: 1 } }, shape)).toEqual([]);
    expect(DocumentShapeUtil.invalidKeysOf({ step: { kind: 'land', target: null } }, shape)).toEqual([]);
    expect(DocumentShapeUtil.invalidKeysOf({ step: { kind: 'land', attempt: 1 } }, shape)).toEqual(['step']);
    expect(DocumentShapeUtil.invalidKeysOf({ step: 'build' }, shape)).toEqual(['step']);
  });
});
