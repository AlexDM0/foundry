/**
 * Where the trackers of one repository meet: a folder in the git common directory, which every worktree shares. It holds the landing
 * journal, which tells a tracker that a sibling moved a target, the lock beside it, and the tracker list, which names each tracker's
 * folder and branch namespace. Every stored line and document carries its format version.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { writeFileAtomically }   from '../atomic-file/AtomicFile.ts';
import { errorCodeOf }           from '../atomic-file/HeldFileFailure.ts';
import { JsonRecordUtil }        from '../json-record/JsonRecordUtil.ts';
import { VersionedRegistryUtil } from '../versioned-registry/VersionedRegistryUtil.ts';
import type { RegistryEntry }    from '../versioned-registry/VersionedRegistryUtil.ts';

const LANDING_JOURNAL_FILE_NAME = 'landings.jsonl';
const LANDING_LOCK_FOLDER_NAME  = 'landings.lock';
const TRACKER_LIST_FILE_NAME    = 'trackers.json';

const LANDING_JOURNAL_FORMAT_VERSION = 1;

const TRACKER_LIST_SHAPE = { supportedVersion: 1, entriesKey: 'trackers' } as const;

const VERSION_KEY = 'version';

const LINE_END = '\n';

const ABSENT_FILE_CODE = 'ENOENT';

/**
 * The lock is a folder for a lock of generation records, held only around a landing's tip check, fast-forward and journal append, and
 * around a change of the tracker list. Both writes here rewrite the whole file, so a caller makes them only while it holds the lock.
 */
export interface RepositoryLandingFiles {
  journalFilePath:     string;
  lockDirectoryPath:   string;
  trackerListFilePath: string;
}

export interface RepositoryLanding {
  trackerId:   string;
  /** The branch the landing moved, as the tracker names it: `main`, or a group branch in the tracker's namespace. */
  target:      string;
  previousTip: string;
  commit:      string;
}

export interface SkippedJournalLine {
  lineNumber: number;
  problem:    'not-json' | 'not-a-landing' | 'newer-version';
}

/**
 * An absent journal reads as one with no landings. A skipped line only hides a landing, which makes a sibling's move read as an
 * unrecorded one: the safe side for every caller.
 */
export type LandingJournalReading =
  | { verdict: 'readable'; landings: RepositoryLanding[]; skippedLines: SkippedJournalLine[] }
  | { verdict: 'unreadable'; reason: string };

export type LandingAppend = { verdict: 'appended' } | { verdict: 'unwritable'; reason: string };

export interface RepositoryTracker {
  trackerId:       string;
  /** The tracker's folder from the repository root, `/`-separated; `''` for a tracker at the root. */
  prefix:          string;
  /** `null` for a tracker whose branches keep their bare names. */
  branchNamespace: string | null;
}

/** A malformed list keeps the trackers that could still be read, so a caller can name them; it is never written over. */
export type TrackerListReading =
  | { verdict: 'readable'; trackers: RepositoryTracker[] }
  | { verdict: 'newer-version'; version: number }
  | { verdict: 'malformed'; problems: string[]; trackers: RepositoryTracker[] }
  | { verdict: 'unreadable'; reason: string };

export type TrackerListWrite =
  | { verdict: 'written' }
  | { verdict: 'newer-version'; version: number }
  | { verdict: 'malformed'; problems: string[] }
  | { verdict: 'unwritable' | 'unreadable'; reason: string };

/** `folderName` is the product's own folder name, which the caller derives, so two products never share one journal. */
function landingFilesOf(gitCommonDirectory: string, folderName: string): RepositoryLandingFiles {
  const folder = join(gitCommonDirectory, folderName);
  return {
    journalFilePath:     join(folder, LANDING_JOURNAL_FILE_NAME),
    lockDirectoryPath:   join(folder, LANDING_LOCK_FOLDER_NAME),
    trackerListFilePath: join(folder, TRACKER_LIST_FILE_NAME),
  };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type StoredText = { verdict: 'read'; text: string | null } | { verdict: 'unreadable'; reason: string };

function storedTextOf(filePath: string): StoredText {
  try {
    return { verdict: 'read', text: readFileSync(filePath, 'utf8') };
  } catch (error) {
    return errorCodeOf(error) === ABSENT_FILE_CODE ? { verdict: 'read', text: null } : { verdict: 'unreadable', reason: reasonOf(error) };
  }
}

function nonEmptyStringOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

type LineReading = { landing: RepositoryLanding } | { problem: SkippedJournalLine['problem'] };

function lineReadingOf(line: string): LineReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { problem: 'not-json' };
  }
  const record = JsonRecordUtil.recordOf(parsed);
  if (record === undefined) return { problem: 'not-a-landing' };
  const version = record[VERSION_KEY];
  if (typeof version === 'number' && Number.isInteger(version) && version > LANDING_JOURNAL_FORMAT_VERSION) return { problem: 'newer-version' };
  const trackerId   = nonEmptyStringOf(record['trackerId']);
  const target      = nonEmptyStringOf(record['target']);
  const previousTip = nonEmptyStringOf(record['previousTip']);
  const commit      = nonEmptyStringOf(record['commit']);
  if (version !== LANDING_JOURNAL_FORMAT_VERSION || trackerId === null || target === null || previousTip === null || commit === null) {
    return { problem: 'not-a-landing' };
  }
  return {
    landing: {
      trackerId, target, previousTip, commit
    }
  };
}

/** Lock-free: a reader sees the journal before or after a rewrite, never a part of one. */
function readLandingJournal(files: RepositoryLandingFiles): LandingJournalReading {
  const stored = storedTextOf(files.journalFilePath);
  if (stored.verdict === 'unreadable') return stored;
  const landings: RepositoryLanding[]      = [];
  const skippedLines: SkippedJournalLine[] = [];
  (stored.text ?? '').split(LINE_END).forEach((line, index) => {
    if (line.trim() === '') return;
    const reading = lineReadingOf(line);
    if ('landing' in reading) landings.push(reading.landing);
    else skippedLines.push({ lineNumber: index + 1, problem: reading.problem });
  });
  return { verdict: 'readable', landings, skippedLines };
}

/** The version leads each line, then the landing's keys in a fixed order, so the bytes of a line never depend on the caller's object. */
function journalLineOf(landing: RepositoryLanding): string {
  const storedLanding = {
    [VERSION_KEY]: LANDING_JOURNAL_FORMAT_VERSION,
    trackerId:     landing.trackerId,
    target:        landing.target,
    previousTip:   landing.previousTip,
    commit:        landing.commit,
  };
  return `${JSON.stringify(storedLanding)}${LINE_END}`;
}

/** Under the lock: every line already stored stays as it is, whatever it holds, and the landing is added as the last line. */
function appendLanding(files: RepositoryLandingFiles, landing: RepositoryLanding): LandingAppend {
  const stored = storedTextOf(files.journalFilePath);
  if (stored.verdict === 'unreadable') return { verdict: 'unwritable', reason: stored.reason };
  const storedText    = stored.text ?? '';
  const separatorLine = storedText === '' || storedText.endsWith(LINE_END) ? '' : LINE_END;
  try {
    writeFileAtomically(files.journalFilePath, `${storedText}${separatorLine}${journalLineOf(landing)}`);
    return { verdict: 'appended' };
  } catch (error) {
    return { verdict: 'unwritable', reason: reasonOf(error) };
  }
}

/** The commits landed on `target` by every tracker, the caller's own included, in journal order. */
function tipsLandedOn(landings: readonly RepositoryLanding[], target: string): string[] {
  return landings.filter((landing) => landing.target === target).map((landing) => landing.commit);
}

function trackerOf(trackerId: string, entry: RegistryEntry): RepositoryTracker | null {
  const { prefix, branchNamespace } = entry;
  if (typeof prefix !== 'string') return null;
  if (branchNamespace === undefined) return { trackerId, prefix, branchNamespace: null };
  const namespace = nonEmptyStringOf(branchNamespace);
  return namespace === null ? null : { trackerId, prefix, branchNamespace: namespace };
}

function trackersOf(entries: Record<string, unknown>, problems: string[]): RepositoryTracker[] {
  const trackers: RepositoryTracker[] = [];
  for (const [trackerId, entryValue] of Object.entries(entries)) {
    const entry   = JsonRecordUtil.recordOf(entryValue);
    const tracker = entry === undefined ? null : trackerOf(trackerId, entry);
    if (tracker === null) problems.push(`tracker "${trackerId}" is not an object with a string "prefix" and, when it has one, a non-empty "branchNamespace"`);
    else trackers.push(tracker);
  }
  return trackers;
}

type TrackerListDocumentReading =
  | { verdict: 'readable'; document: Record<string, unknown>; trackers: RepositoryTracker[] }
  | Exclude<TrackerListReading, { verdict: 'readable' }>;

function trackerListDocumentOf(files: RepositoryLandingFiles): TrackerListDocumentReading {
  const stored = storedTextOf(files.trackerListFilePath);
  if (stored.verdict === 'unreadable') return stored;
  const reading = VersionedRegistryUtil.readingOf(stored.text, TRACKER_LIST_SHAPE);
  if (reading.verdict === 'newer-version') return reading;
  const problems = reading.verdict === 'malformed' ? [...reading.problems] : [];
  const trackers = trackersOf(JsonRecordUtil.recordOf(reading.document[TRACKER_LIST_SHAPE.entriesKey]) ?? {}, problems);
  return problems.length === 0 ? { verdict: 'readable', document: reading.document, trackers } : { verdict: 'malformed', problems, trackers };
}

/** An absent list reads as one with no trackers. */
function readTrackerList(files: RepositoryLandingFiles): TrackerListReading {
  const reading = trackerListDocumentOf(files);
  return reading.verdict === 'readable' ? { verdict: 'readable', trackers: reading.trackers } : reading;
}

function entryWith(storedEntry: RegistryEntry | undefined, tracker: RepositoryTracker): RegistryEntry {
  const { branchNamespace: storedNamespace, ...keptKeys } = storedEntry ?? {};
  return tracker.branchNamespace === null
    ? { ...keptKeys, prefix: tracker.prefix }
    : { ...keptKeys, prefix: tracker.prefix, branchNamespace: tracker.branchNamespace };
}

/**
 * Under the lock: adds the tracker, or replaces its entry in place, keeping every key this format does not know. A newer or a malformed
 * list is never written over, since another tracker's entry would be lost.
 */
function writeTrackerEntry(files: RepositoryLandingFiles, tracker: RepositoryTracker): TrackerListWrite {
  const reading = trackerListDocumentOf(files);
  if (reading.verdict === 'malformed') return { verdict: 'malformed', problems: reading.problems };
  if (reading.verdict !== 'readable') return reading;
  const document = VersionedRegistryUtil.documentWithEntry(reading.document, TRACKER_LIST_SHAPE, tracker.trackerId, (storedEntry) => entryWith(storedEntry, tracker));
  try {
    writeFileAtomically(files.trackerListFilePath, VersionedRegistryUtil.textOf(document));
    return { verdict: 'written' };
  } catch (error) {
    return { verdict: 'unwritable', reason: reasonOf(error) };
  }
}

export const RepositoryLandings = Object.freeze({
  landingFilesOf,
  readLandingJournal,
  appendLanding,
  tipsLandedOn,
  readTrackerList,
  writeTrackerEntry,
});
