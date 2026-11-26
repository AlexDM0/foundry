/** The shape checks of the files Hephaestus keeps in a job's folder, each worded as the reason an ingestion reports. */
import { JsonRecordUtil }  from '../../lib/json-record/JsonRecordUtil.ts';
import { StoredValueUtil } from './StoredValueUtil.ts';

/** A stored field's check and what the field must be, as its reason words it. */
export type FieldCheck = readonly [check: (value: unknown) => boolean, expected: string];

function valueIsText(value: unknown): value is string {
  return typeof value === 'string';
}

function valueIsATextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(valueIsText);
}

function valueIsATextRecord(value: unknown): value is Record<string, string> {
  return JsonRecordUtil.valueIsAPlainObject(value) && Object.values(value).every(valueIsText);
}

function valueIsANumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/** A stored word of a vocabulary. */
function oneOf(words: readonly unknown[]): (value: unknown) => boolean {
  return (value) => words.includes(value);
}

/** A field a writer leaves out until it is set: absent, or as `check` wants it. */
function optional(check: (value: unknown) => boolean): (value: unknown) => boolean {
  return (value) => value === undefined || check(value);
}

/**
 * The first field whose stored value fails its check, as `its "<field>" is not <expected>`, the field named from the document's root through
 * `parentPath` (`launchSnapshot.`); `null` when every field holds.
 */
function firstFieldProblemOf(document: Readonly<Record<string, unknown>>, checks: Readonly<Record<string, FieldCheck>>, parentPath = ''): string | null {
  for (const [field, [check, expected]] of Object.entries(checks)) {
    if (!check(Object.hasOwn(document, field) ? document[field] : undefined)) return `its "${parentPath}${field}" is not ${expected}`;
  }
  return null;
}

/** A kept launch snapshot's first problem, its fields named from `launchSnapshot.`; `null` when it holds. */
function launchSnapshotProblemOf(snapshot: unknown): string | null {
  if (!JsonRecordUtil.valueIsAPlainObject(snapshot)) return 'its "launchSnapshot" is not an object';
  return firstFieldProblemOf(snapshot, {
    refs:              [valueIsATextRecord, 'a record of commits'],
    hooksFolderDigest: [StoredValueUtil.valueIsTextOrNull, 'text or null'],
  }, 'launchSnapshot.');
}

export const JobFileShapeUtil = {
  valueIsText,
  valueIsATextList,
  valueIsATextRecord,
  valueIsTextOrNull: StoredValueUtil.valueIsTextOrNull,
  valueIsANumberOrNull,
  oneOf,
  optional,
  firstFieldProblemOf,
  launchSnapshotProblemOf,
} as const;
