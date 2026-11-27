/**
 * How Hephaestus finds its board's one Talos: it attaches to the newest one while it runs at the required protocol version, and otherwise
 * waits out a Talos that quits, stops and sweeps a lost one, and starts the next from the program on disk. A Talos it started that answers
 * another protocol version holds Hephaestus's start for the rest of its life: starting again would give the same Talos.
 */
import { spawn }       from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { HephaestusLog }              from '../../adapters/@types/HephaestusLogRecord.ts';
import { TalosChildRecordCopy }            from '../../adapters/crash-log/TalosChildRecordCopy.ts';
import { LaunchRegistryIngestion }         from '../../adapters/launch-registry/LaunchRegistryIngestion.ts';
import type { LaunchRegistryEntry }        from '../../domain/talos/ChildLaunch.ts';
import { type ChildRecord, childRecordOf } from '../../domain/talos/ChildRecord.ts';
import {
  childFilesOf,
  endpointFolderOf,
  launchRegistryPathOf,
  startFilePathOf,
  talosFolderOf,
  talosLogPathOf,
  talosRecordPathOf,
  talosSecretPathOf
} from '../../domain/talos/TalosFiles.ts';
import { type TalosRecord, talosRecordOf }                             from '../../domain/talos/TalosRecord.ts';
import { type TalosStartFile, talosStartFileOf, talosStartFileTextOf } from '../../domain/talos/TalosStartFile.ts';
import { TALOS_START_FILE_FORMAT_VERSION }                             from '../../domain/talos/constants/TalosProtocol.ts';
import type { InterruptionCause }                                      from '../../domain/tracker-model/@types/Job.ts';
import { INTERRUPTION_CAUSES }                                         from '../../domain/tracker-model/constants/JobStates.ts';
import { writeFileAtomically, writeOwnerOnlyFileAtomically }           from '../../lib/atomic-file/AtomicFile.ts';
import type { PlatformPorts }                                          from '../../lib/platform-ports/PlatformPortsFor.ts';
import { type ProcessIdentity, sameBoot }                              from '../../lib/process-identity/ProcessIdentity.ts';
import { outlivingProgramEnvironment }                                 from '../../shared/Environment.ts';
import { refuseUnlessOwnerOnly }                                       from '../../shared/OwnerOnlyRestrictionRefusal.ts';
import { ToolRuntimeUtil }                                             from '../../shared/ToolRuntimeUtil.ts';
import {
  CLEAN_QUIT_TURN_END_WAIT_MILLISECONDS,
  LEASE_RENEWAL_INTERVAL_MILLISECONDS,
  SUPERVISION_LEASE_MILLISECONDS,
  TALOS_FRAME_TIMEOUT_MILLISECONDS,
  TALOS_QUIT_TRIES,
  TALOS_START_INTERVAL_MILLISECONDS,
  TALOS_START_TRIES,
  TALOS_TICK_GAP_MILLISECONDS,
  TALOS_TICK_MILLISECONDS
} from '../../shared/constants/HephaestusLimits.ts';
import { dataFolderPathOf }                                                     from './HephaestusFiles.ts';
import { RefusedForcedStops }                                                   from './RefusedForcedStops.ts';
import type { TalosConnection, TalosConnectionOutcome, TalosConnectionRequest } from './TalosConnection.ts';
import type { UnreadableBoardFiles }                                            from './UnreadableBoardFiles.ts';

export const TALOS_ENTRY_PATH = join(import.meta.dir, '..', '..', '..', 'talos.ts');

const TALOS_SECRET_BYTES = 24;

export type TalosAvailability =
  | { verdict: 'attached'; connection: TalosConnection; startNumber: number }
  | { verdict: 'started'; connection: TalosConnection; startNumber: number; previousTalos: 'none' | 'quit' | 'lost'; sweptOrphans: number }
  | { verdict: 'held'; reason: 'talos-protocol-differs'; answeredProtocolVersion: number }
  /** The Talos just started never served: its endpoint does not fit this platform, it refused its start, or it stayed silent. */
  | { verdict: 'unavailable'; reason: 'endpoint-does-not-fit' | 'start-refused' | 'not-serving'; startNumber: number };

/** What Hephaestus writes into each start file; specs pass short ones. */
export type TalosStartBounds = Pick<TalosStartFile, 'leaseMilliseconds' | 'renewalIntervalMilliseconds' | 'cleanQuitWaitMilliseconds' | 'tickMilliseconds' | 'tickGapMilliseconds'>;

/** How long Hephaestus waits on a Talos; a schedule only, never a decision. */
export interface TalosStartWaits {
  frameTimeoutMilliseconds: number;
  startTries:               number;
  quitTries:                number;
  intervalMilliseconds:     number;
}

export const TALOS_START_BOUNDS: TalosStartBounds = Object.freeze({
  leaseMilliseconds:           SUPERVISION_LEASE_MILLISECONDS,
  renewalIntervalMilliseconds: LEASE_RENEWAL_INTERVAL_MILLISECONDS,
  cleanQuitWaitMilliseconds:   CLEAN_QUIT_TURN_END_WAIT_MILLISECONDS,
  tickMilliseconds:            TALOS_TICK_MILLISECONDS,
  tickGapMilliseconds:         TALOS_TICK_GAP_MILLISECONDS,
});

export const TALOS_START_WAITS: TalosStartWaits = Object.freeze({
  frameTimeoutMilliseconds: TALOS_FRAME_TIMEOUT_MILLISECONDS,
  startTries:               TALOS_START_TRIES,
  quitTries:                TALOS_QUIT_TRIES,
  intervalMilliseconds:     TALOS_START_INTERVAL_MILLISECONDS,
});

export interface TalosSpawnRequest {
  boardFolder:    string;
  startNumber:    number;
  /** Talos's working directory, so it holds no worktree it does not own. */
  repositoryRoot: string;
}

/** Answers the spawned process's id, if the platform gave one. */
export type TalosSpawn = (ports: PlatformPorts, request: TalosSpawnRequest) => number | undefined;

/** One per Hephaestus: once a Talos it started answered another protocol version, it never starts one again. */
export interface TalosStartHold {
  answeredProtocolVersion: number | null;
}

export interface TalosStartContext {
  boardFolder:          string;
  monitorFolder:        string;
  trackerId:            string;
  codeVersion:          string;
  repositoryRoot:       string;
  ports:                PlatformPorts;
  bounds:               TalosStartBounds;
  waits:                TalosStartWaits;
  connect:              (request: TalosConnectionRequest) => Promise<TalosConnectionOutcome>;
  startTalos:           TalosSpawn;
  hold:                 TalosStartHold;
  log:                  HephaestusLog;
  /** The board files Hephaestus could not read, which the board header warns of until it restarts. */
  unreadableBoardFiles: UnreadableBoardFiles;
}

export function createTalosStartHold(): TalosStartHold {
  return { answeredProtocolVersion: null };
}

/**
 * `process.execPath <talos.ts> <board folder> <start number>`, detached and unreferenced, its output appended to its log; it never loads a
 * tracked repository's bunfig or `.env`.
 */
export function spawnTalos({ processSupervision }: PlatformPorts, request: TalosSpawnRequest): number | undefined {
  mkdirSync(talosFolderOf(request.boardFolder), { recursive: true });
  const logDescriptor = openSync(talosLogPathOf(request.boardFolder, request.startNumber), 'a');
  try {
    const talosArguments = [...ToolRuntimeUtil.isolatingArgumentsOfThisCheckout(), TALOS_ENTRY_PATH, request.boardFolder, String(request.startNumber)];
    const talos = spawn(process.execPath, talosArguments, {
      ...processSupervision.spawnOptionsFor('detached-program'),
      cwd:   request.repositoryRoot,
      env:   outlivingProgramEnvironment(),
      stdio: ['ignore', logDescriptor, logDescriptor],
    });
    talos.unref();
    return talos.pid;
  } finally {
    closeSync(logDescriptor);
  }
}

const START_FILE_PATTERN = /^start-(?<startNumber>[1-9]\d*)\.json$/;
const TALOS_RECORD_PATTERN = /^talos-(?<startNumber>[1-9]\d*)\.json$/;

function startNumbersIn(boardFolder: string, pattern: RegExp): number[] {
  let fileNames: string[];
  try {
    fileNames = readdirSync(talosFolderOf(boardFolder));
  } catch {
    return [];
  }
  return fileNames.flatMap((fileName) => {
    const startNumber = pattern.exec(fileName)?.groups?.['startNumber'];
    return startNumber === undefined ? [] : [Number(startNumber)];
  });
}

function textOf(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** The start number of the board's newest Talos record; `null` when no Talos ever claimed the board. */
export function newestTalosStartNumberIn(boardFolder: string): number | null {
  const recordedStartNumbers = startNumbersIn(boardFolder, TALOS_RECORD_PATTERN);
  return recordedStartNumbers.length === 0 ? null : Math.max(...recordedStartNumbers);
}

export function talosRecordAt(boardFolder: string, startNumber: number): TalosRecord | null {
  const text = textOf(talosRecordPathOf(boardFolder, startNumber));
  const reading = text === null ? null : talosRecordOf(text);
  return reading?.verdict === 'read' ? reading.record : null;
}

function startFileAt(boardFolder: string, startNumber: number): TalosStartFile | null {
  const text = textOf(startFilePathOf(boardFolder, startNumber));
  const reading = text === null ? null : talosStartFileOf(text);
  return reading?.verdict === 'read' ? reading.record : null;
}

function childRecordAt(boardFolder: string, childFolder: string, instance: number): ChildRecord | null {
  const text = textOf(childFilesOf(boardFolder, childFolder, instance).recordPath);
  const reading = text === null ? null : childRecordOf(text);
  return reading?.verdict === 'read' ? reading.record : null;
}

/** The process the record names, while it still is that process; a reused process id reads as gone. */
export function runningIdentityOf({ processSupervision }: PlatformPorts, recorded: ProcessIdentity | null): ProcessIdentity | null {
  if (recorded === null) return null;
  const current = processSupervision.identityOf(recorded.processId);
  return current !== null && processSupervision.sameProcess(current, recorded) ? recorded : null;
}

function pause(milliseconds: number): Promise<void> {
  return Bun.sleep(milliseconds);
}

/**
 * The registry's well-formed lines. The registry is board-wide and never heals, so a line that does not fit, or a registry that cannot be read
 * at all, is reported to the board header; the readable lines still count, so a sweep stops every child it can name.
 */
function registeredChildrenOf(boardFolder: string, startNumber: number, unreadableBoardFiles: UnreadableBoardFiles): LaunchRegistryEntry[] {
  const registryPath = launchRegistryPathOf(boardFolder, startNumber);
  const reading = new LaunchRegistryIngestion(registryPath).read();
  const file = dataFolderPathOf(boardFolder, registryPath);
  if (reading.verdict === 'absent') return [];
  if (reading.verdict === 'unreadable') {
    unreadableBoardFiles.report({ file, problem: reading.problem });
    return [];
  }
  const [firstUnreadableLine] = reading.unreadableLines;
  if (firstUnreadableLine !== undefined) {
    unreadableBoardFiles.report({ file, problem: { ...firstUnreadableLine.problem, lineNumber: firstUnreadableLine.lineNumber } });
  }
  return reading.entries;
}

/** Each child record a Talos registered, copied as stored for a crash log; one never written is left out. */
export function persistedChildRecordsOf(boardFolder: string, startNumber: number, unreadableBoardFiles: UnreadableBoardFiles): unknown[] {
  return registeredChildrenOf(boardFolder, startNumber, unreadableBoardFiles).flatMap(({ childFolder, instance }) => {
    const copied = new TalosChildRecordCopy(childFilesOf(boardFolder, childFolder, instance).recordPath).read();
    return copied.verdict === 'readable' ? [copied.copy] : [];
  });
}

function childFolderPathOf(boardFolder: string, childFolder: string, instance: number): string {
  return dirname(childFilesOf(boardFolder, childFolder, instance).recordPath);
}

export interface LostChildRequest {
  boardFolder:          string;
  childFolder:          string;
  instance:             number;
  /** The lost Talos's boot, where its record names one: a child is never older than its Talos. */
  talosBootIdentity:    string | null;
  /** A refused forced stop is tried again only when this says so. */
  retryRefusedStop:     boolean;
  unreadableBoardFiles: UnreadableBoardFiles;
  log:                  HephaestusLog;
}

function interruptionCauseOf(text: string): InterruptionCause | null {
  return INTERRUPTION_CAUSES.find((cause) => cause === text) ?? null;
}

/**
 * A child of a lost Talos, settled once and its cause stored beside its record, so a Hephaestus dying after the stop reads the same cause
 * again. A foreign boot is a reboot; a recorded child tree still alive is stopped with the groups below it, and the cause is the lost
 * commander (still stored as `talos-lost`); otherwise the child ended with it. A refused forced stop stores no cause and answers `null`. A
 * stored text that names no interruption cause is logged and settled again, which writes over it.
 */
export function settleLostChild({ processSupervision }: PlatformPorts, request: LostChildRequest): InterruptionCause | null {
  const childFolderPath = childFolderPathOf(request.boardFolder, request.childFolder, request.instance);
  const lostCausePath = join(childFolderPath, `child-${request.instance}.lost-cause`);
  const storedText = textOf(lostCausePath)?.trim() ?? '';
  const storedCause = interruptionCauseOf(storedText);
  if (storedCause !== null) return storedCause;
  if (storedText !== '') request.log({ kind: 'lost-cause-unreadable', lostCausePath, storedText });
  const refusedStops = RefusedForcedStops.storedOf(request.boardFolder, childFolderPath, request.instance, request.unreadableBoardFiles);
  if (refusedStops.refusals > 0 && !request.retryRefusedStop) return null;
  const record = childRecordAt(request.boardFolder, request.childFolder, request.instance);
  const currentBoot = processSupervision.identityOf(process.pid)?.bootIdentity ?? null;
  const recordedBoot = request.talosBootIdentity ?? record?.talos?.bootIdentity ?? record?.childProcess?.bootIdentity ?? null;
  let cause: InterruptionCause = 'agent-crashed';
  if (recordedBoot !== null && (currentBoot === null || !sameBoot(recordedBoot, currentBoot))) cause = 'reboot';
  else if (record?.childProcess !== undefined && record.childProcess !== null) {
    const treeMembers = processSupervision.treeMembersOf(record.childProcess) ?? [];
    const { verdict } = processSupervision.stopTree(record.childProcess, 'force', treeMembers);
    if (verdict === 'refused') {
      const treeProcessIds = [...new Set([record.childProcess.processId, ...treeMembers.map((member) => member.processId)])];
      RefusedForcedStops.store(childFolderPath, request.instance, { refusals: refusedStops.refusals + 1, treeProcessIds });
      return null;
    }
    if (verdict === 'signalled') cause = 'talos-lost';
  }
  writeFileAtomically(lostCausePath, `${cause}\n`);
  return cause;
}

/** Settles every child of the Talos's registry whose record is not `ended`; answers how many it settled. */
function sweepOrphansOf(context: TalosStartContext, startNumber: number, talos: ProcessIdentity | null): number {
  let swept = 0;
  for (const { childFolder, instance } of registeredChildrenOf(context.boardFolder, startNumber, context.unreadableBoardFiles)) {
    if (childRecordAt(context.boardFolder, childFolder, instance)?.state === 'ended') continue;
    const cause = settleLostChild(context.ports, {
      boardFolder:          context.boardFolder,
      childFolder,
      instance,
      talosBootIdentity:    talos?.bootIdentity ?? null,
      retryRefusedStop:     true,
      unreadableBoardFiles: context.unreadableBoardFiles,
      log:                  context.log,
    });
    if (cause === null) {
      context.log({
        kind: 'lost-child-stop-refused', childFolder, instance, talosStartNumber: startNumber
      });
    }
    else swept += 1;
  }
  return swept;
}

/** A forced stop of the recorded process alone, identity checked: its children are in groups of their own, and a sweep settles them. */
function stopTalosProcess(context: TalosStartContext, talos: ProcessIdentity | null): void {
  const running = runningIdentityOf(context.ports, talos);
  if (running === null) return;
  context.ports.processSupervision.stopProcess(running.processId, 'force');
}

async function waitedRecordOf(context: TalosStartContext, startNumber: number, tries: number, isSettled: (record: TalosRecord | null) => boolean): Promise<TalosRecord | null> {
  let record = talosRecordAt(context.boardFolder, startNumber);
  // The tries only bound the wait; what settles it is Talos's own record and the process table.
  for (let attempt = 0; attempt < tries && !isSettled(record); attempt += 1) {
    await pause(context.waits.intervalMilliseconds);
    record = talosRecordAt(context.boardFolder, startNumber);
  }
  return record;
}

/** Waits for the Talos to record `quit` or be gone, stops it past the wait, and sweeps what a forced stop left. Answers the swept orphans. */
async function waitOutQuittingTalos(context: TalosStartContext, startNumber: number, talos: ProcessIdentity | null): Promise<number> {
  const quitOrGone = (record: TalosRecord | null): boolean => record?.state === 'quit' || runningIdentityOf(context.ports, talos) === null;
  const record = await waitedRecordOf(context, startNumber, context.waits.quitTries, quitOrGone);
  if (quitOrGone(record)) return 0;
  stopTalosProcess(context, talos);
  context.log({ kind: 'talos-stopped-after-quit-wait', talosStartNumber: startNumber });
  return sweepOrphansOf(context, startNumber, talos);
}

function treatAsLost(context: TalosStartContext, startNumber: number, talos: ProcessIdentity | null): number {
  stopTalosProcess(context, talos);
  const sweptOrphans = sweepOrphansOf(context, startNumber, talos);
  context.log({ kind: 'talos-lost', talosStartNumber: startNumber, sweptOrphans });
  return sweptOrphans;
}

type PreviousTalos =
  | { verdict: 'attached'; connection: TalosConnection; startNumber: number }
  | { verdict: 'settled'; previousTalos: 'none' | 'quit' | 'lost'; sweptOrphans: number };

async function connectionOutcomeOf(context: TalosStartContext, startNumber: number): Promise<TalosConnectionOutcome> {
  const startFile = startFileAt(context.boardFolder, startNumber);
  const secret = startFile === null ? '' : textOf(startFile.secretFilePath)?.trim() ?? '';
  if (startFile === null || secret === '') return { verdict: 'silent' };
  return await context.connect({
    endpoint: startFile.endpoint, secret, localEndpoint: context.ports.localEndpoint, frameTimeoutMilliseconds: context.waits.frameTimeoutMilliseconds,
  });
}

async function settlePreviousTalos(context: TalosStartContext, startNumber: number): Promise<PreviousTalos> {
  let record = talosRecordAt(context.boardFolder, startNumber);
  if (record?.state === 'quit') return { verdict: 'settled', previousTalos: 'quit', sweptOrphans: 0 };
  const talos = record?.talos ?? null;
  if (record === null || runningIdentityOf(context.ports, talos) === null) {
    return { verdict: 'settled', previousTalos: 'lost', sweptOrphans: treatAsLost(context, startNumber, talos) };
  }
  if (record.state === 'quitting') return { verdict: 'settled', previousTalos: 'quit', sweptOrphans: await waitOutQuittingTalos(context, startNumber, talos) };
  if (record.state === 'claimed') record = await waitedRecordOf(context, startNumber, context.waits.startTries, (waited) => waited?.state !== 'claimed');
  if (record?.state === 'quit') return { verdict: 'settled', previousTalos: 'quit', sweptOrphans: 0 };
  const outcome = await connectionOutcomeOf(context, startNumber);
  if (outcome.verdict === 'welcomed') return { verdict: 'attached', connection: outcome.connection, startNumber };
  if (outcome.verdict === 'version-mismatch' || (outcome.verdict === 'refused' && outcome.reason === 'quitting')) {
    return { verdict: 'settled', previousTalos: 'quit', sweptOrphans: await waitOutQuittingTalos(context, startNumber, talos) };
  }
  return { verdict: 'settled', previousTalos: 'lost', sweptOrphans: treatAsLost(context, startNumber, talos) };
}

function writeTalosSecret({ ownerOnlyFiles }: PlatformPorts, secretFilePath: string): string {
  const secret = randomBytes(TALOS_SECRET_BYTES).toString('hex');
  mkdirSync(dirname(secretFilePath), { recursive: true });
  refuseUnlessOwnerOnly(ownerOnlyFiles.restrictFolder(dirname(secretFilePath)));
  writeOwnerOnlyFileAtomically(secretFilePath, secret);
  refuseUnlessOwnerOnly(ownerOnlyFiles.restrictFile(secretFilePath));
  return secret;
}

async function startNextTalos(context: TalosStartContext, startNumber: number, previousTalos: 'none' | 'quit' | 'lost', sweptOrphans: number): Promise<TalosAvailability> {
  const {
    boardFolder, monitorFolder, trackerId, ports
  } = context;
  const endpoint = ports.localEndpoint.endpointOf({
    socketFolder: endpointFolderOf(monitorFolder), scope: trackerId, name: 'talos', instance: startNumber
  });
  if (!ports.localEndpoint.endpointFits(endpoint)) {
    context.log({ kind: 'talos-endpoint-does-not-fit', talosStartNumber: startNumber, endpoint });
    return { verdict: 'unavailable', reason: 'endpoint-does-not-fit', startNumber };
  }
  const secretFilePath = talosSecretPathOf(monitorFolder, trackerId, startNumber);
  writeTalosSecret(ports, secretFilePath);
  const startFile: TalosStartFile = {
    formatVersion: TALOS_START_FILE_FORMAT_VERSION,
    startNumber,
    boardFolder,
    endpoint,
    secretFilePath,
    codeVersion:   context.codeVersion,
    ...context.bounds,
  };
  mkdirSync(talosFolderOf(boardFolder), { recursive: true });
  writeFileAtomically(startFilePathOf(boardFolder, startNumber), talosStartFileTextOf(startFile));
  context.startTalos(ports, { boardFolder, startNumber, repositoryRoot: context.repositoryRoot });

  const record = await waitedRecordOf(context, startNumber, context.waits.startTries, (waited) => waited?.state === 'serving' || waited?.state === 'quit');
  if (record?.state !== 'serving') {
    if (record?.state !== 'quit') stopTalosProcess(context, record?.talos ?? null);
    context.log({ kind: 'talos-did-not-serve', talosStartNumber: startNumber, recordState: record?.state ?? null });
    return { verdict: 'unavailable', reason: record?.state === 'quit' ? 'start-refused' : 'not-serving', startNumber };
  }
  const outcome = await connectionOutcomeOf(context, startNumber);
  if (outcome.verdict === 'welcomed') {
    return {
      verdict: 'started', connection: outcome.connection, startNumber, previousTalos, sweptOrphans
    };
  }
  if (outcome.verdict === 'version-mismatch') {
    context.hold.answeredProtocolVersion = outcome.protocolVersion;
    context.log({ kind: 'talos-protocol-differs', talosStartNumber: startNumber, protocolVersion: outcome.protocolVersion });
    return { verdict: 'held', reason: 'talos-protocol-differs', answeredProtocolVersion: outcome.protocolVersion };
  }
  context.log({ kind: 'talos-did-not-welcome', talosStartNumber: startNumber, answer: outcome.verdict });
  return { verdict: 'unavailable', reason: 'not-serving', startNumber };
}

export async function ensureTalos(context: TalosStartContext): Promise<TalosAvailability> {
  const { answeredProtocolVersion } = context.hold;
  if (answeredProtocolVersion !== null) return { verdict: 'held', reason: 'talos-protocol-differs', answeredProtocolVersion };
  const recordedStartNumbers = startNumbersIn(context.boardFolder, TALOS_RECORD_PATTERN);
  const everyStartNumber = [...recordedStartNumbers, ...startNumbersIn(context.boardFolder, START_FILE_PATTERN)];
  const nextStartNumber = Math.max(0, ...everyStartNumber) + 1;
  if (recordedStartNumbers.length === 0) return startNextTalos(context, nextStartNumber, 'none', 0);
  const newestStartNumber = Math.max(...recordedStartNumbers);
  const previous = await settlePreviousTalos(context, newestStartNumber);
  if (previous.verdict === 'attached') return previous;
  return startNextTalos(context, nextStartNumber, previous.previousTalos, previous.sweptOrphans);
}
