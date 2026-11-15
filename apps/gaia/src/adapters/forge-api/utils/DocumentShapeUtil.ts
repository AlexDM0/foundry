/**
 * Checks a parsed JSON document against the shape of the keys a reader needs, and names every key that is missing or fails its rule as a
 * path into the document. Every key is read as the document's own, never through its prototype.
 */
import { JsonValueUtil, type JsonObject } from '../../../lib/json-value/JsonValueUtil.ts';

/**
 * `text` is any string, `whole-number` a safe integer of zero or more, `text-list` an array of strings. `optional` lets the key be absent,
 * `nullable` lets it hold `null`; `listOf` is an array whose every item is an object of the shape.
 */
export type FieldRule =
  | 'text'
  | 'whole-number'
  | 'boolean'
  | 'text-list'
  | { readonly oneOf: readonly string[] }
  | { readonly object: DocumentShape }
  | { readonly listOf: DocumentShape }
  | { readonly nullable: FieldRule }
  | { readonly optional: FieldRule };

export type DocumentShape = Readonly<Record<string, FieldRule>>;

/** A shape that names every key of `Document` and no other, so the shape and the type it vouches for cannot drift apart by a key. */
export type ShapeOf<Document> = { readonly [Key in keyof Document]-?: FieldRule };

const NO_KEYS: JsonObject = Object.freeze({});

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function keyPathOf(parentPath: string, key: string): string {
  return parentPath === '' ? key : `${parentPath}.${key}`;
}

function valueFitsNamedRule(value: unknown, rule: 'text' | 'whole-number' | 'boolean' | 'text-list'): boolean {
  switch (rule) {
    case 'text':
      return typeof value === 'string';
    case 'whole-number':
      return isWholeNumber(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'text-list':
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
}

function collectInvalidKeysOfShape(record: JsonObject, shape: DocumentShape, parentPath: string, invalidKeys: string[]): void {
  for (const [key, rule] of Object.entries(shape)) {
    collectInvalidKeysOfValue(JsonValueUtil.ownValueOf(record, key), rule, keyPathOf(parentPath, key), invalidKeys);
  }
}

function collectInvalidKeysOfList(value: unknown, itemShape: DocumentShape, path: string, invalidKeys: string[]): void {
  if (!Array.isArray(value)) {
    invalidKeys.push(path);
    return;
  }
  value.forEach((item: unknown, i) => {
    const itemPath = `${path}[${i}]`;
    const record   = JsonValueUtil.jsonObjectOf(item);
    if (record === null) invalidKeys.push(itemPath);
    else collectInvalidKeysOfShape(record, itemShape, itemPath, invalidKeys);
  });
}

function collectInvalidKeysOfValue(value: unknown, rule: FieldRule, path: string, invalidKeys: string[]): void {
  if (typeof rule === 'string') {
    if (!valueFitsNamedRule(value, rule)) invalidKeys.push(path);
    return;
  }
  if ('optional' in rule) {
    if (value !== undefined) collectInvalidKeysOfValue(value, rule.optional, path, invalidKeys);
    return;
  }
  if ('nullable' in rule) {
    if (value !== null) collectInvalidKeysOfValue(value, rule.nullable, path, invalidKeys);
    return;
  }
  if ('oneOf' in rule) {
    if (typeof value !== 'string' || !rule.oneOf.includes(value)) invalidKeys.push(path);
    return;
  }
  if ('listOf' in rule) {
    collectInvalidKeysOfList(value, rule.listOf, path, invalidKeys);
    return;
  }
  const record = JsonValueUtil.jsonObjectOf(value);
  if (record === null) invalidKeys.push(path);
  else collectInvalidKeysOfShape(record, rule.object, path, invalidKeys);
}

/** A document that is not a JSON object holds none of the shape's keys, so each key it requires is named. */
function invalidKeysOf(document: unknown, shape: DocumentShape): readonly string[] {
  const invalidKeys: string[] = [];
  collectInvalidKeysOfShape(JsonValueUtil.jsonObjectOf(document) ?? NO_KEYS, shape, '', invalidKeys);
  return invalidKeys;
}

/** The document's own value at a top-level key; `undefined` when the document is no object or does not hold the key. */
function topLevelValueOf(document: unknown, key: string): unknown {
  return JsonValueUtil.ownValueOf(JsonValueUtil.jsonObjectOf(document) ?? NO_KEYS, key);
}

export const DocumentShapeUtil = {
  invalidKeysOf,
  topLevelValueOf,
  isWholeNumber,
} as const;
