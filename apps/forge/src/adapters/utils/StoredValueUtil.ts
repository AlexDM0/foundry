/**
 * The checks every stored format's validation shares: a stored text parsed as JSON, whether a parsed value is a whole number, and whether it
 * is a list of the pictures User sent.
 */
import { JsonRecordUtil }     from '../../lib/json-record/JsonRecordUtil.ts';
import { PICTURE_ID_PATTERN } from '../../lib/tracker-model/constants/PictureIdPattern.ts';

export type ParsedJson =
  | { verdict: 'parsed'; value: unknown }
  | { verdict: 'unparseable'; problem: string };

const BYTE_ORDER_MARK = '\uFEFF';

/**
 * The problem is worded as the reason an ingestion reports, so a caller that names a file or a line only prefixes it. A leading byte order
 * mark is skipped, since `JSON.parse` refuses it.
 */
function parsedJsonOf(text: string): ParsedJson {
  try {
    return { verdict: 'parsed', value: JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text) };
  } catch (error) {
    return { verdict: 'unparseable', problem: `it is not valid JSON (${error instanceof Error ? error.message : 'unparseable'})` };
  }
}

function valueIsAWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function wholeNumberIsAtLeast(value: unknown, lowest: number): value is number {
  return valueIsAWholeNumber(value) && value >= lowest;
}

function pictureReferenceIsWellFormed(value: unknown): boolean {
  return JsonRecordUtil.valueIsAPlainObject(value) && typeof value['pictureId'] === 'string' && PICTURE_ID_PATTERN.test(value['pictureId'])
    && typeof value['name'] === 'string';
}

/** A stored list of pictures is written only once there is one, so an empty list is no stored value. */
function picturesAreWellFormed(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(pictureReferenceIsWellFormed);
}

/** A parsed object's own field; `undefined` when it has none, never one it inherits. */
function ownFieldOf(fields: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(fields, key) ? fields[key] : undefined;
}

function valueIsTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** A stored word of a vocabulary. */
function valueIsOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export const StoredValueUtil = {
  parsedJsonOf,
  ownFieldOf,
  valueIsTextOrNull,
  valueIsOneOf,
  valueIsAWholeNumber,
  wholeNumberIsAtLeast,
  picturesAreWellFormed,
} as const;
