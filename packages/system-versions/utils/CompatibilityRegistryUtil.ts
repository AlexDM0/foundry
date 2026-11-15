/**
 * The logic of a compatibility registry, for any server: which entries a client of a version needs, what raising the minimum supported
 * version lets the server remove, and the guard that fails while the registry keeps an entry no supported client needs.
 */
import type { CompatibilityEntry, EndpointEntry, RaiseMinimumReport } from '../@types/CompatibilityEntry.ts';
import type { SystemVersion, VersionsDocument }                       from '../@types/VersionsDocument.ts';
import { SystemVersionUtil }                                          from './SystemVersionUtil.ts';

export interface RaiseMinimumAnswer {
  readonly outcome: 'reported' | 'refused';
  readonly text:    string;
}

const { isOlder, textOf } = SystemVersionUtil;

function labelOf(entry: CompatibilityEntry): string {
  return entry.kind === 'endpoint' ? `endpoint ${entry.endpoint} at v${entry.version}` : entry.name;
}

function isNeededBy(entry: CompatibilityEntry, clientVersion: SystemVersion): boolean {
  const { lastNeededBy } = entry;
  return !isOlder(clientVersion, entry.introducedIn) && (lastNeededBy === null || !isOlder(lastNeededBy, clientVersion));
}

function lifetimesOverlap(first: CompatibilityEntry, second: CompatibilityEntry): boolean {
  const firstEndsBeforeSecond = first.lastNeededBy !== null && isOlder(first.lastNeededBy, second.introducedIn);
  const secondEndsBeforeFirst = second.lastNeededBy !== null && isOlder(second.lastNeededBy, first.introducedIn);
  return !firstEndsBeforeSecond && !secondEndsBeforeFirst;
}

/** The entries whose last needing version lies below `minimum`: no client the server supports at that minimum needs them. */
function removableAt<Entry extends CompatibilityEntry>(registry: readonly Entry[], minimum: SystemVersion): Entry[] {
  return registry.filter((entry) => entry.lastNeededBy !== null && isOlder(entry.lastNeededBy, minimum));
}

/** The version of `endpoint` a client built for `clientVersion` calls; `null` when the server serves that client no such endpoint. */
function endpointVersionAt(registry: readonly CompatibilityEntry[], endpoint: string, clientVersion: SystemVersion): number | null {
  const served = registry.find((entry): entry is EndpointEntry => entry.kind === 'endpoint' && entry.endpoint === endpoint && isNeededBy(entry, clientVersion));
  return served?.version ?? null;
}

function entrySentencesOf(entry: CompatibilityEntry, versions: VersionsDocument): string[] {
  const label = labelOf(entry);
  const sentences: string[] = [];
  if (entry.kind === 'endpoint' && (!Number.isSafeInteger(entry.version) || entry.version < 1)) sentences.push(`${label} has no whole version of at least 1`);
  if (isOlder(versions.current, entry.introducedIn)) {
    sentences.push(`${label} is introduced in ${textOf(entry.introducedIn)}, after the current version ${textOf(versions.current)}`);
  }
  const { lastNeededBy } = entry;
  if (lastNeededBy === null) return sentences;
  if (isOlder(lastNeededBy, entry.introducedIn)) sentences.push(`${label} is last needed by ${textOf(lastNeededBy)}, before its introduction in ${textOf(entry.introducedIn)}`);
  if (!isOlder(lastNeededBy, versions.current)) {
    sentences.push(`${label} is last needed by ${textOf(lastNeededBy)}, not before the current version: an entry the current version needs has no last version`);
  }
  if (isOlder(lastNeededBy, versions.minimumSupported)) {
    sentences.push(`${label} is last needed by ${textOf(lastNeededBy)}, below the minimum supported ${textOf(versions.minimumSupported)}: remove it and what it keeps`);
  }
  return sentences;
}

/**
 * Every way the registry and the server's versions disagree, as sentences; empty when they hold together. An entry no supported client
 * needs any more is one of them, so a spec that expects none fails from the moment the minimum is raised until the entry is removed.
 */
function inconsistenciesOf(registry: readonly CompatibilityEntry[], versions: VersionsDocument): string[] {
  const sentences: string[] = [];
  if (isOlder(versions.current, versions.minimumSupported)) {
    sentences.push(`the minimum supported version ${textOf(versions.minimumSupported)} is newer than the current version ${textOf(versions.current)}`);
  }
  const labels = registry.map(labelOf);
  for (const [index, entry] of registry.entries()) {
    if (labels.indexOf(labelOf(entry)) !== index) sentences.push(`${labelOf(entry)} is named twice`);
    sentences.push(...entrySentencesOf(entry, versions));
    for (const later of registry.slice(index + 1)) {
      const sameEndpoint = entry.kind === 'endpoint' && later.kind === 'endpoint' && entry.endpoint === later.endpoint && entry.version !== later.version;
      if (sameEndpoint && lifetimesOverlap(entry, later)) sentences.push(`${labelOf(entry)} and ${labelOf(later)} are both needed by one client version`);
    }
  }
  return sentences;
}

function raiseReportOf<Entry extends CompatibilityEntry>(registry: readonly Entry[], versions: VersionsDocument, minimum: SystemVersion): RaiseMinimumReport<Entry> {
  const removable = removableAt(registry, minimum);
  return {
    versions,
    minimum,
    removable,
    kept: registry.filter((entry) => !removable.includes(entry)),
  };
}

function lifetimeTextOf(entry: CompatibilityEntry): string {
  const lastNeeded = entry.lastNeededBy === null ? 'still needed' : `last needed by ${textOf(entry.lastNeededBy)}`;
  return `introduced in ${textOf(entry.introducedIn)}, ${lastNeeded}`;
}

function entryLinesOf(entries: readonly CompatibilityEntry[]): string[] {
  return entries.map((entry) => `  ${labelOf(entry)} (${lifetimeTextOf(entry)})`);
}

function entryCountOf(entries: readonly CompatibilityEntry[]): string {
  return entries.length === 1 ? '1 entry' : `${entries.length} entries`;
}

function reportTextOf(report: RaiseMinimumReport<CompatibilityEntry>): string {
  const raise = `Raising the minimum supported version from ${textOf(report.versions.minimumSupported)} to ${textOf(report.minimum)}`;
  return [
    report.removable.length === 0 ? `${raise} makes nothing removable.` : `${raise} makes ${entryCountOf(report.removable)} removable:`,
    ...entryLinesOf(report.removable),
    report.kept.length === 0 ? 'Nothing must stay.' : `${entryCountOf(report.kept)} must stay:`,
    ...entryLinesOf(report.kept),
    'A dry run: nothing changed. Once the minimum is raised, the registry guard fails until each removable entry, and what it keeps, is removed.',
  ].join('\n');
}

/** The report for the minimum `requestedText` names, or why it is no raise: a dry run that changes nothing. */
function raiseMinimumAnswerOf(registry: readonly CompatibilityEntry[], versions: VersionsDocument, requestedText: string | undefined): RaiseMinimumAnswer {
  const minimum = SystemVersionUtil.versionOfText(requestedText ?? '');
  if (minimum === null) return { outcome: 'refused', text: `Name the new minimum supported version as major.minor, such as ${textOf(versions.current)}.` };
  if (!isOlder(versions.minimumSupported, minimum)) {
    return { outcome: 'refused', text: `${textOf(minimum)} is no raise: the minimum supported version is ${textOf(versions.minimumSupported)}.` };
  }
  if (isOlder(versions.current, minimum)) {
    return { outcome: 'refused', text: `${textOf(minimum)} is newer than the current version ${textOf(versions.current)}, which no client could then be built for.` };
  }
  return { outcome: 'reported', text: reportTextOf(raiseReportOf(registry, versions, minimum)) };
}

export const CompatibilityRegistryUtil = {
  labelOf,
  removableAt,
  endpointVersionAt,
  inconsistenciesOf,
  raiseReportOf,
  reportTextOf,
  raiseMinimumAnswerOf,
} as const;
