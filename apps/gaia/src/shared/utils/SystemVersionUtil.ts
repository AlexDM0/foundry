/**
 * A system version as `GET /api/versions` and every message carry it, `{ major, minor }` of whole numbers: read from unchecked JSON,
 * compared, and written as text for a machine line. Comparing two versions of one system is ordering them, never a clock.
 */
import type { SystemVersion, VersionsDocument } from 'system-versions/VersionsDocument';

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function ownValueOf(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !Object.hasOwn(value, key)) return undefined;
  return (value as Readonly<Record<string, unknown>>)[key];
}

/** The version a value holds as its own `major` and `minor`; `null` for anything else. Other keys are passed over. */
function systemVersionOf(value: unknown): SystemVersion | null {
  const major = ownValueOf(value, 'major');
  const minor = ownValueOf(value, 'minor');
  return isWholeNumber(major) && isWholeNumber(minor) ? { major, minor } : null;
}

/** Negative when `first` is the older, positive when it is the newer, 0 when both are the same version. */
function comparisonOf(first: SystemVersion, second: SystemVersion): number {
  return first.major === second.major ? first.minor - second.minor : first.major - second.major;
}

function isOlder(version: SystemVersion, than: SystemVersion): boolean {
  return comparisonOf(version, than) < 0;
}

/** A versions document whose minimum lies above its current version says nothing a client can trust, so it reads as no document. */
function versionsDocumentOf(value: unknown): VersionsDocument | null {
  const current = systemVersionOf(ownValueOf(value, 'current'));
  const minimumSupported = systemVersionOf(ownValueOf(value, 'minimumSupported'));
  if (current === null || minimumSupported === null || isOlder(current, minimumSupported)) return null;
  return { current, minimumSupported };
}

function textOf({ major, minor }: SystemVersion): string {
  return `${major}.${minor}`;
}

export const SystemVersionUtil = {
  systemVersionOf,
  comparisonOf,
  isOlder,
  versionsDocumentOf,
  textOf,
} as const;
