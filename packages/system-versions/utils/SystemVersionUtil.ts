/** Comparing, writing and reading system versions. Comparing two versions of one system is ordering them, never a clock. */
import type { SystemVersion } from '../@types/VersionsDocument.ts';

const VERSION_TEXT = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Negative when `first` is the older, positive when it is the newer, 0 when both are the same version. */
function comparisonOf(first: SystemVersion, second: SystemVersion): number {
  return first.major === second.major ? first.minor - second.minor : first.major - second.major;
}

function isOlder(version: SystemVersion, than: SystemVersion): boolean {
  return comparisonOf(version, than) < 0;
}

function textOf({ major, minor }: SystemVersion): string {
  return `${major}.${minor}`;
}

/** The version `major.minor` names, as whole numbers without leading zeros; `null` for any other text. */
function versionOfText(text: string): SystemVersion | null {
  const match = VERSION_TEXT.exec(text);
  if (match === null) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : null;
}

export const SystemVersionUtil = {
  comparisonOf,
  isOlder,
  textOf,
  versionOfText,
} as const;
