/**
 * The one reading rule of every versioned contract. A document carries its version in the integer key it has always carried, read as its
 * major; a stored file adds its format's minor in an optional sibling key, absent read as 0. A known major reads at any minor, its unknown
 * keys passed over; an older major reads only where its ingestion still migrates it; a newer major is refused.
 */

/** A stored file's format version: a minor only adds keys, which a reader of the same major passes over. */
export interface FormatVersion {
  readonly major: number;
  readonly minor: number;
}

/** Where a document carries its version: `monitorVersion` alone, or a stored file's `version` and `minor`. */
export interface ContractVersionKeys {
  readonly majorKey:  string;
  readonly minorKey?: string;
}

/** `unversioned`: the document names no major. `malformed`: the major, or a minor that is there, is no whole number. */
export type ContractVersionReading =
  | { readonly verdict: 'versioned'; readonly version: FormatVersion }
  | { readonly verdict: 'unversioned' }
  | { readonly verdict: 'malformed'; readonly invalidKey: string };

/** `known`: the major the reader knows, at any minor. `older-read`: an older major its ingestion migrates. `older` and `newer` are refused. */
export type MajorVerdict = 'known' | 'older-read' | 'older' | 'newer';

const NO_OLDER_MAJORS: readonly number[] = [];

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function ownValueOf(document: unknown, key: string): unknown {
  if (typeof document !== 'object' || document === null || Array.isArray(document) || !Object.hasOwn(document, key)) return undefined;
  return (document as Readonly<Record<string, unknown>>)[key];
}

function versionOf(document: unknown, { majorKey, minorKey }: ContractVersionKeys): ContractVersionReading {
  const major = ownValueOf(document, majorKey);
  if (major === undefined) return { verdict: 'unversioned' };
  if (!isWholeNumber(major)) return { verdict: 'malformed', invalidKey: majorKey };
  const minor = minorKey === undefined ? undefined : ownValueOf(document, minorKey);
  if (minor === undefined) return { verdict: 'versioned', version: { major, minor: 0 } };
  if (!isWholeNumber(minor)) return { verdict: 'malformed', invalidKey: minorKey ?? majorKey };
  return { verdict: 'versioned', version: { major, minor } };
}

function majorVerdictOf(major: number, knownMajor: number, olderMajorsRead: readonly number[] = NO_OLDER_MAJORS): MajorVerdict {
  if (major === knownMajor) return 'known';
  if (major > knownMajor) return 'newer';
  return olderMajorsRead.includes(major) ? 'older-read' : 'older';
}

/** The major of a document at a major this reader reads, at any minor; `null` for any other, unversioned or malformed document. */
function readMajorOf(document: unknown, keys: ContractVersionKeys, knownMajor: number, olderMajorsRead: readonly number[] = NO_OLDER_MAJORS): number | null {
  const reading = versionOf(document, keys);
  if (reading.verdict !== 'versioned') return null;
  const verdict = majorVerdictOf(reading.version.major, knownMajor, olderMajorsRead);
  return verdict === 'known' || verdict === 'older-read' ? reading.version.major : null;
}

export const ContractVersionUtil = {
  versionOf,
  majorVerdictOf,
  readMajorOf,
} as const;
