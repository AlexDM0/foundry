/**
 * Checks of parsed JSON values that Talos's frames and stored records share, and the one text shape and reading verdict of its stored
 * records. Nothing here throws: a value that fails a check reads as a verdict.
 */
import { JsonRecordUtil }                         from '../../../lib/json-record/JsonRecordUtil.ts';
import { type ProcessIdentity, storedIdentityOf } from '../../../lib/process-identity/ProcessIdentity.ts';

/** Why a stored record is unreadable: `parserError` is the JSON parser's own message, `field` the key whose value does not fit. */
export type StoredRecordProblem =
  | { readonly code: 'not-json'; readonly parserError: string }
  | { readonly code: 'not-a-json-object' }
  | { readonly code: 'format-version-not-a-whole-number' }
  | { readonly code: 'field-malformed'; readonly field: string };

export type StoredRecordReading<StoredRecord> =
  | { verdict: 'read'; record: StoredRecord }
  | { verdict: 'unreadable'; problem: StoredRecordProblem }
  | { verdict: 'other-format'; formatVersion: number };

type ParsedObjectReading =
  | { verdict: 'object'; parsed: Readonly<Record<string, unknown>> }
  | Exclude<StoredRecordReading<never>, { verdict: 'read' }>;

/** A key the value holds itself, never one it inherits. */
function ownFieldOf(parsed: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(parsed, key) ? parsed[key] : undefined;
}

function isWholeNumberAtLeast(value: unknown, least: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= least;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return JsonRecordUtil.valueIsAPlainObject(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** `undefined` when the value is neither `null` nor an identity, so a damaged identity is never read as an unknown one. */
function identityOrNullOf(value: unknown): ProcessIdentity | null | undefined {
  if (value === null) return null;
  const identity = storedIdentityOf(value);
  return identity !== null && Object.hasOwn(value as object, 'startStamp') ? identity : undefined;
}

/** Two-space JSON and a final line feed. */
function storedTextOf(record: object): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** The parsed object of a stored record of `formatVersion`; any other format is named before a field is looked at. */
function parsedObjectOf(text: string, formatVersion: number): ParsedObjectReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { verdict: 'unreadable', problem: { code: 'not-json', parserError: String(error) } };
  }
  if (!JsonRecordUtil.valueIsAPlainObject(parsed)) return { verdict: 'unreadable', problem: { code: 'not-a-json-object' } };
  const storedFormatVersion = ownFieldOf(parsed, 'formatVersion');
  if (!Number.isSafeInteger(storedFormatVersion)) return { verdict: 'unreadable', problem: { code: 'format-version-not-a-whole-number' } };
  if (storedFormatVersion !== formatVersion) return { verdict: 'other-format', formatVersion: storedFormatVersion as number };
  return { verdict: 'object', parsed };
}

export const ParsedValueUtil = Object.freeze({
  ownFieldOf,
  isWholeNumberAtLeast,
  isStringRecord,
  isOneOf,
  identityOrNullOf,
  storedTextOf,
  parsedObjectOf,
});
