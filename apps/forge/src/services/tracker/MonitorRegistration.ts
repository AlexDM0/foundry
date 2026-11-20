/**
 * Records a tracker whose page this call wrote in the machine-wide registry `~/.agent-progress-monitor/projects.json`, which a monitor
 * reads to find every project's root and page. It never fails the command: every way it does not register comes back as a verdict.
 */
import { mkdirSync, realpathSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from 'node:path';

import { storedFileTextOf }                                                from '../../adapters/StoredFileText.ts';
import { writeFileAtomically }                                             from '../../lib/atomic-file/AtomicFile.ts';
import { GitProcess }                                                      from '../../lib/git/GitProcess.ts';
import { LocalTimeUtil }                                                   from '../../lib/local-time/LocalTimeUtil.ts';
import { VersionedRegistryUtil, type RegistryEntry, type RegistryShape }   from '../../lib/versioned-registry/VersionedRegistryUtil.ts';
import { refusalIsOperationRefusal }                                       from '../../shared/OperationRefusal.ts';
import { type LockHolderIsGone, NO_LOCK_HOLDER_READS_AS_GONE, withLockAt } from './GenerationLock.ts';
import { MONITOR_REGISTRY_FILES }                                          from './constants/MonitorRegistryFiles.ts';

/** The board's progress record as the caller read it through the store: the registry names the board by it. */
export type ProgressRegistrationReading =
  | { verdict: 'readable'; trackerId: string; project: string }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export interface MonitorRegistrationRequest {
  /** The repository folder the board governs. */
  rootDirectory:        string;
  /** The board's page, which a monitor opens. */
  htmlFilePath:         string;
  progress:             ProgressRegistrationReading;
  /** The registry's folder, as the platform's `DataFolders.monitorFolderOf` answers it for the home folder. */
  monitorFolder:        string;
  /** Every temp folder of the machine: a tracker under any of them is a scratch one nobody monitors. */
  temporaryDirectories: readonly string[];
  /** The verb that wrote the page, such as `ticket hold`. */
  command:              string;
  /** The absolute path of the program that writes the entry, which a monitor starts this board's Overseer with. */
  program:              string;
  now:                  () => Date;
  /** The live Overseer, written at its start; `removed` at its stop; absent, a stored Overseer key is kept as it was. */
  overseer?:            OverseerRegistration | 'removed';
  /** Whether the forge serves, stopped, handed over or crashed, written beside `overseer`; absent, a stored presence key is kept as it was. */
  presence?:            PresenceRegistration;
  /** The platform's process check for the registry lock; absent, only a stale stamp frees it. */
  lockHolderIsGone?:    LockHolderIsGone;
}

export interface OverseerRegistration {
  url:       string;
  processId: number;
  startedAt: string;
  /** The absolute path of the Overseer's token file, which a monitor reads its bearer token from. */
  tokenPath: string;
}

/** `crashLogPath` is `null` only when the crash path could not write its crash log. */
export interface RegisteredCrash {
  component:    'overseer' | 'talos';
  suspected:    boolean;
  errorName:    string | null;
  errorMessage: string | null;
  crashLogPath: string | null;
}

/**
 * A kill from outside writes nothing: a stored `serving` whose process answers nothing is what a monitor sees until a start classifies it. A
 * `crashed` generation is `null` when neither a presence record nor a Baton names it.
 */
export type PresenceRegistration =
  | { state: 'serving'; generation: number; at: string; process: { processId: number; startStamp: string; bootIdentity: string } }
  | { state: 'stopped' | 'handed-over'; generation: number; at: string }
  | { state: 'crashed'; generation: number | null; at: string; crash: RegisteredCrash };

export type MonitorRegistrationOutcome =
  | { verdict: 'registered'; registryFilePath: string }
  | { verdict: 'registered-over-malformed'; registryFilePath: string; problems: string[] }
  | { verdict: 'not-registered-temporary-tracker' }
  | { verdict: 'not-registered-unreadable-tracker'; reason: string }
  | { verdict: 'not-registered-newer-version'; registryFilePath: string; version: number }
  | { verdict: 'not-registered-unwritable'; registryFilePath: string; reason: string };

const REGISTRY_SHAPE: RegistryShape = { supportedVersion: MONITOR_REGISTRY_FILES.SUPPORTED_VERSION, entriesKey: MONITOR_REGISTRY_FILES.ENTRIES_KEY };

const REGISTERED_AT_KEY = 'registeredAt';
const OVERSEER_KEY        = 'overseer';
const PRESENCE_KEY        = 'presence';

/** A path that does not exist is resolved through its nearest existing ancestor, so `/tmp/missing` still reads as under `/private/tmp`. */
function canonicalPathOf(path: string): string {
  const absolutePath = resolve(path);
  try {
    return realpathSync(absolutePath);
  } catch {
    const parentDirectory = dirname(absolutePath);
    return parentDirectory === absolutePath ? absolutePath : join(canonicalPathOf(parentDirectory), basename(absolutePath));
  }
}

function trackerLiesInATemporaryFolder(rootDirectory: string, temporaryDirectories: readonly string[]): boolean {
  const canonicalRoot = canonicalPathOf(rootDirectory);
  return temporaryDirectories.some((temporaryDirectory) => {
    const pathFromTemporaryFolder = relative(canonicalPathOf(temporaryDirectory), canonicalRoot);
    return !pathFromTemporaryFolder.startsWith('..') && !isAbsolute(pathFromTemporaryFolder);
  });
}

/** `null` when the repository has no `origin` remote, or git cannot say. */
function gitOriginOf(rootDirectory: string): string | null {
  const finishedRun = GitProcess.run(rootDirectory, ['remote', 'get-url', 'origin']);
  if (finishedRun === null || finishedRun.exitCode !== 0) return null;
  const origin = finishedRun.standardOutput.trim();
  return origin.length > 0 ? origin : null;
}

function errorReasonOf(error: unknown): string {
  if (refusalIsOperationRefusal(error)) return 'its lock is held by another process';
  return error instanceof Error ? error.message : String(error);
}

interface Registration {
  registryFilePath: string;
  trackerId:        string;
  /** What this write says about the tracker's place, all replaced on every write, so a moved tracker's one entry follows it. */
  locationFields:   RegistryEntry;
  changedAt:        string;
  command:          string;
  overseer?:        OverseerRegistration | 'removed';
  presence?:        PresenceRegistration;
}

/** Keeps the stored entry's keys, unknown ones included, in order, and its first `registeredAt`. */
function updatedEntry(storedEntry: RegistryEntry | undefined, registration: Registration): RegistryEntry {
  const storedRegisteredAt = storedEntry?.[REGISTERED_AT_KEY];
  const entry: RegistryEntry = {
    ...storedEntry,
    ...registration.locationFields,
    [REGISTERED_AT_KEY]: typeof storedRegisteredAt === 'string' ? storedRegisteredAt : registration.changedAt,
    lastChangedAt:       registration.changedAt,
    lastCommand:         registration.command,
  };
  if (registration.overseer === 'removed') delete entry[OVERSEER_KEY];
  else if (registration.overseer !== undefined) entry[OVERSEER_KEY] = { ...registration.overseer };
  if (registration.presence !== undefined) entry[PRESENCE_KEY] = structuredClone(registration.presence);
  return entry;
}

function registerUnderTheLock(registration: Registration): MonitorRegistrationOutcome {
  const { registryFilePath, trackerId } = registration;
  const storedText = storedFileTextOf(registryFilePath);
  if (storedText.verdict === 'unreadable') return { verdict: 'not-registered-unwritable', registryFilePath, reason: storedText.reason };
  const reading = VersionedRegistryUtil.readingOf(storedText.verdict === 'readable' ? storedText.text : null, REGISTRY_SHAPE);
  if (reading.verdict === 'newer-version') return { verdict: 'not-registered-newer-version', registryFilePath, version: reading.version };

  const document = VersionedRegistryUtil.documentWithEntry(reading.document, REGISTRY_SHAPE, trackerId, (storedEntry) => updatedEntry(storedEntry, registration));
  writeFileAtomically(registryFilePath, VersionedRegistryUtil.textOf(document));
  return reading.verdict === 'malformed'
    ? { verdict: 'registered-over-malformed', registryFilePath, problems: reading.problems }
    : { verdict: 'registered', registryFilePath };
}

export async function registerWithTheMonitor(request: MonitorRegistrationRequest): Promise<MonitorRegistrationOutcome> {
  const {
    rootDirectory, htmlFilePath, progress, monitorFolder, temporaryDirectories, command, program, now, overseer, presence,
    lockHolderIsGone = NO_LOCK_HOLDER_READS_AS_GONE
  } = request;
  if (trackerLiesInATemporaryFolder(rootDirectory, temporaryDirectories)) return { verdict: 'not-registered-temporary-tracker' };
  if (progress.verdict === 'absent') return { verdict: 'not-registered-unreadable-tracker', reason: 'its progress file is absent' };
  if (progress.verdict === 'unreadable') return { verdict: 'not-registered-unreadable-tracker', reason: progress.reason };

  const registryFilePath = join(monitorFolder, MONITOR_REGISTRY_FILES.REGISTRY_FILE_NAME);
  const registration: Registration = {
    registryFilePath,
    trackerId:      progress.trackerId,
    locationFields: {
      project:      progress.project,
      root:         rootDirectory,
      progressHtml: htmlFilePath,
      gitOrigin:    gitOriginOf(rootDirectory),
      program,
    },
    changedAt: LocalTimeUtil.formatLocalIso(now()),
    command,
    ...(overseer === undefined ? {} : { overseer }),
    ...(presence === undefined ? {} : { presence }),
  };
  try {
    // Made before the lock, which would otherwise read a home it cannot write as a lock held until its retries ran out.
    mkdirSync(monitorFolder, { recursive: true });
    return await withLockAt(join(monitorFolder, MONITOR_REGISTRY_FILES.LOCK_DIRECTORY_NAME), () => registerUnderTheLock(registration), now, lockHolderIsGone);
  } catch (error) {
    return { verdict: 'not-registered-unwritable', registryFilePath, reason: errorReasonOf(error) };
  }
}
