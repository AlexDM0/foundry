/**
 * The Overseer's side of its Watchers, read and spawned through the job folder `<data>/jobs/<J>/` alone: whether a Watcher instance is live by
 * the identity in its claimed Watcher file, the events it logged past a cursor, and the spawn of a new instance from the pinned bundle,
 * spawned so it outlives the Overseer.
 */
import { spawn, type SpawnOptions } from 'node:child_process';
import { randomBytes }              from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { AgentLaunchPlan }                                       from '../../lib/agent-launch/AgentLaunchPlan.ts';
import { writeFileAtomically, writeOwnerOnlyFileAtomically }          from '../../lib/atomic-file/AtomicFile.ts';
import type { PlatformPorts }                                         from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessTreeMember }                                     from '../../lib/process-identity/ProcessSupervision.ts';
import type { ActingFrame }                                           from '../../lib/watcher/@types/WatcherFrame.ts';
import type { EventLogEntry }                                         from '../../lib/watcher/EventLog.ts';
import type { EndpointInstanceFacts }                                 from '../../lib/watcher/LocalEndpoint.ts';
import { watcherFilesOf, watcherSecretPathOf }                        from '../../lib/watcher/WatcherFiles.ts';
import { type WatcherLaunch, readWatcherLaunch, readWatcherSecret }   from '../../lib/watcher/WatcherLaunch.ts';
import { type WatcherEnd, type WatcherRecord, watcherRecordOfStored } from '../../lib/watcher/WatcherRecord.ts';
import { EVENT_LOG_FORMAT_VERSION, WATCHER_PROTOCOL_VERSION }         from '../../lib/watcher/constants/WatcherProtocol.ts';
import { outlivingProgramEnvironment }                                from '../../shared/Environment.ts';
import { OperationRefusal }                                           from '../../shared/OperationRefusal.ts';
import { ToolRuntimeUtil }                                            from '../../shared/ToolRuntimeUtil.ts';
import { LegacyWatcherReader }                                        from './LegacyWatcherReader.ts';

export type WatcherLiveness =
  | { verdict: 'unclaimed' }
  | { verdict: 'live' }
  | { verdict: 'ended'; end: WatcherEnd }
  /** Claimed, never recorded as ended, and its process is gone: a Watcher killed or lost to a reboot. */
  | { verdict: 'lost' };

export interface WatcherSpawnRequest {
  bundlePath:    string;
  jobFolder:     string;
  instance:      number;
  /** Where it runs, so no Watcher holds a worktree it does not own as its working directory. */
  rootDirectory: string;
}

export interface WatcherLaunchFileRequest {
  jobFolder:                       string;
  instance:                        number;
  jobId:                           string;
  trackerId:                       string;
  monitorFolder:                   string;
  watcherCodeVersion:              string;
  workingDirectory:                string;
  plan:                            AgentLaunchPlan;
  /** Set for a job whose groups the Watcher stops as it ends; absent, they keep running. */
  treeStopAtEndGraceMilliseconds?: number;
}

const WATCHER_SECRET_BYTES = 24;

/** How long the Overseer waits on a Watcher to take its frames; a schedule only, never a decision. */
const WATCHER_FRAME_TIMEOUT_MILLISECONDS = 2000;

/** How long `stopLiveProcessWatchers` waits on the Watchers it stopped to record their end; a schedule only. */
export interface StoppedWatcherWait {
  tries:                number;
  intervalMilliseconds: number;
}

const STOPPED_WATCHER_WAIT: StoppedWatcherWait = { tries: 100, intervalMilliseconds: 20 };

function jobFolderOf(trackerDirectory: string, jobId: string): string {
  return join(trackerDirectory, 'jobs', jobId);
}

function watcherRecordOf(jobFolder: string, instance: number): WatcherRecord | null {
  try {
    return watcherRecordOfStored(JSON.parse(readFileSync(watcherFilesOf(jobFolder, instance).watcherRecordPath, 'utf8')));
  } catch {
    return null;
  }
}

/** The Watcher's own identity decides, never a clock: a reused process id or a reboot reads as lost. */
function livenessOf({ processSupervision }: PlatformPorts, jobFolder: string, instance: number): WatcherLiveness {
  if (!existsSync(watcherFilesOf(jobFolder, instance).watcherRecordPath)) return { verdict: 'unclaimed' };
  const record = watcherRecordOf(jobFolder, instance);
  if (record?.end !== undefined) return { verdict: 'ended', end: record.end };
  // A claim is created whole or not at all and then replaced atomically, so a record unreadable or naming no Watcher is damage: lost.
  if (record === null || record.watcher === null) return { verdict: 'lost' };
  const current = processSupervision.identityOf(record.watcher.processId);
  return current !== null && processSupervision.sameProcess(current, record.watcher) ? { verdict: 'live' } : { verdict: 'lost' };
}

/** Every entry past `afterSequence`; a malformed log is reported to the caller rather than read in part. */
function eventsAfter(jobFolder: string, instance: number, afterSequence: number): readonly EventLogEntry[] | 'malformed' {
  let text: string;
  try {
    text = readFileSync(watcherFilesOf(jobFolder, instance).eventLogPath, 'utf8');
  } catch {
    return [];
  }
  const formatVersion = watcherRecordOf(jobFolder, instance)?.eventLogFormatVersion ?? EVENT_LOG_FORMAT_VERSION;
  const reading       = LegacyWatcherReader.eventLogReadingOf(text, formatVersion);
  if (reading.verdict !== 'read') return 'malformed';
  return reading.entries.filter((entry) => entry.sequence > afterSequence);
}

/** Written fresh for each instance into the owner-only folder, the only place its Watcher secret is kept. Answers the file's path. */
function writeWatcherSecret({ ownerOnlyFiles }: PlatformPorts, secretFilePath: string): string {
  ownerOnlyFiles.restrictFolder(dirname(secretFilePath));
  writeOwnerOnlyFileAtomically(secretFilePath, randomBytes(WATCHER_SECRET_BYTES).toString('hex'));
  ownerOnlyFiles.restrictFile(secretFilePath);
  return secretFilePath;
}

/** The endpoint a launch of these facts would get, when this platform cannot bind it; a caller asks before it does the launch's first work. */
function unfitEndpointOf({ localEndpoint }: PlatformPorts, facts: EndpointInstanceFacts): string | null {
  const endpoint = localEndpoint.endpointOf(facts);
  return localEndpoint.endpointFits(endpoint) ? null : endpoint;
}

/** Each launch keeps the one endpoint this answers, which is drawn before any of its files exist. */
function fittingEndpointOf({ localEndpoint }: PlatformPorts, facts: EndpointInstanceFacts): string {
  const endpoint = localEndpoint.endpointOf(facts);
  if (!localEndpoint.endpointFits(endpoint)) throw new OperationRefusal('refused', { kind: 'watcher-endpoint-does-not-fit', endpoint });
  return endpoint;
}

function writeLaunchFiles(ports: PlatformPorts, request: WatcherLaunchFileRequest): void {
  const socketPath = fittingEndpointOf(ports, request);
  mkdirSync(request.jobFolder, { recursive: true });
  for (const file of request.plan.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileAtomically(file.path, file.text);
  }
  const launch: WatcherLaunch = {
    kind:               'agent',
    argv:               request.plan.argv,
    environment:        request.plan.environment,
    ...(request.plan.environmentFromWatcher === undefined ? {} : { environmentFromWatcher: request.plan.environmentFromWatcher }),
    workingDirectory:   request.workingDirectory,
    standingReplies:    request.plan.standingReplies,
    protocolVersion:    WATCHER_PROTOCOL_VERSION,
    jobId:              request.jobId,
    watcherCodeVersion: request.watcherCodeVersion,
    socketPath,
    secretFilePath:     writeWatcherSecret(ports, watcherSecretPathOf(request.monitorFolder, request.trackerId, request.jobId, request.instance)),
    ...(request.treeStopAtEndGraceMilliseconds === undefined ? {} : { treeStopAtEndGraceMilliseconds: request.treeStopAtEndGraceMilliseconds }),
  };
  writeFileAtomically(watcherFilesOf(request.jobFolder, request.instance).launchPath, `${JSON.stringify(launch, null, 2)}\n`);
}

export interface ProcessLaunchFileRequest {
  watcherFolder:      string;
  instance:           number;
  jobId:              string;
  /** Names the socket apart from the job's Watcher and its other process Watchers. */
  socketName:         string;
  trackerId:          string;
  monitorFolder:      string;
  watcherCodeVersion: string;
  workingDirectory:   string;
  argv:               readonly string[];
  /** The shell line's answer; written to the launch file only when set. */
  verbatimArguments?: boolean;
  environment:        Readonly<Record<string, string>>;
}

/** A process Watcher's launch: no standing replies and no input, its child's output logged as events. */
function writeProcessLaunchFile(ports: PlatformPorts, request: ProcessLaunchFileRequest): void {
  const socketPath = fittingEndpointOf(ports, { ...request, jobId: request.socketName });
  mkdirSync(request.watcherFolder, { recursive: true });
  const launch: WatcherLaunch = {
    kind:               'process',
    argv:               request.argv,
    environment:        request.environment,
    workingDirectory:   request.workingDirectory,
    standingReplies:    [],
    protocolVersion:    WATCHER_PROTOCOL_VERSION,
    jobId:              request.jobId,
    watcherCodeVersion: request.watcherCodeVersion,
    socketPath,
    secretFilePath:     writeWatcherSecret(ports, watcherSecretPathOf(request.monitorFolder, request.trackerId, request.socketName, request.instance)),
    ...(request.verbatimArguments === true ? { verbatimArguments: true } : {}),
  };
  writeFileAtomically(watcherFilesOf(request.watcherFolder, request.instance).launchPath, `${JSON.stringify(launch, null, 2)}\n`);
}

/** Says hello with the instance's secret, sends the frames and hangs up, answering whether it connected; a Watcher gone or silent is left alone.
 * A legacy Watcher is sent nothing: only a `stop` reaches it, as a signal to its recorded process group. */
async function sendFrames(
  ports: PlatformPorts,
  jobFolder: string,
  instance: number,
  frames: readonly ActingFrame[],
  frameTimeoutMilliseconds: number = WATCHER_FRAME_TIMEOUT_MILLISECONDS,
): Promise<boolean> {
  const record = watcherRecordOf(jobFolder, instance);
  if (LegacyWatcherReader.attachmentOf(record) === 'legacy-watcher') {
    return record !== null && frames.some((frame) => frame.kind === 'stop') && LegacyWatcherReader.stopLegacyWatcher(ports, record);
  }
  const reading = readWatcherLaunch(watcherFilesOf(jobFolder, instance).launchPath, ports.localEndpoint);
  if (reading.verdict !== 'read') return false;
  const { socketPath, secretFilePath } = reading.launch;
  const watcherSecret = readWatcherSecret(secretFilePath);
  if (watcherSecret === null) return false;
  return await new Promise<boolean>((resolve) => {
    const socket = ports.localEndpoint.connectionTo(socketPath);
    let connected = false;
    const settle = (): void => {
      clearTimeout(timer);
      socket.destroy();
      resolve(connected);
    };
    const timer = setTimeout(settle, frameTimeoutMilliseconds);
    // The Watcher answers `hello` with `welcome` and `history`; a socket nobody reads stays paused and never sees `close`.
    socket.on('data', () => undefined);
    socket.once('error', settle);
    socket.once('close', settle);
    socket.once('connect', () => {
      connected = true;
      const hello = {
        kind: 'hello', protocolVersion: LegacyWatcherReader.helloProtocolVersionOf(record), sinceSequence: Number.MAX_SAFE_INTEGER, watcherSecret
      };
      socket.end([hello, ...frames].map((frame) => `${JSON.stringify(frame)}\n`).join(''));
    });
  });
}

/**
 * Sends the frames to a live Watcher unless its marker is there, writing the marker only once the Watcher took them: a send that failed is
 * tried again on a later pass while the Watcher is live. Delivery is at least once: an Overseer that dies after the take and before the
 * marker sends the frames again once restarted. The Watcher ignores a repeated `close-input` or `stop`; a repeated `write` reaches the
 * session as one more line.
 */
async function sendFramesOnce(ports: PlatformPorts, markerPath: string, jobFolder: string, instance: number, frames: readonly ActingFrame[]): Promise<boolean> {
  if (existsSync(markerPath) || livenessOf(ports, jobFolder, instance).verdict !== 'live') return false;
  if (!await sendFrames(ports, jobFolder, instance, frames)) return false;
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, '');
  return true;
}

function watcherSpawnOptionsOf({ processSupervision }: PlatformPorts, rootDirectory: string, logDescriptor: number): SpawnOptions {
  return {
    ...processSupervision.spawnOptionsFor('watcher'),
    cwd:   rootDirectory,
    env:   outlivingProgramEnvironment(),
    stdio: ['ignore', logDescriptor, logDescriptor],
  };
}

/**
 * `process.execPath <bundle> <job folder> <instance>`, detached and unreferenced, its output appended to the instance's Watcher log; it never
 * loads the root's bunfig or `.env`.
 */
function spawnWatcher(ports: PlatformPorts, request: WatcherSpawnRequest): number | undefined {
  const logDescriptor = openSync(watcherFilesOf(request.jobFolder, request.instance).watcherLogPath, 'a');
  try {
    const watcherArguments = [...ToolRuntimeUtil.isolatingArgumentsOfThisCheckout(), request.bundlePath, request.jobFolder, String(request.instance)];
    const watcher = spawn(process.execPath, watcherArguments, watcherSpawnOptionsOf(ports, request.rootDirectory, logDescriptor));
    watcher.unref();
    return watcher.pid;
  } finally {
    closeSync(logDescriptor);
  }
}

const WATCHER_RECORD_FILE_PATTERN = /^watcher-(?<instance>\d+)\.json$/;

function claimedInstancesIn(watcherFolder: string): number[] {
  let fileNames: string[];
  try {
    fileNames = readdirSync(watcherFolder);
  } catch {
    return [];
  }
  return fileNames.flatMap((fileName) => {
    const instance = WATCHER_RECORD_FILE_PATTERN.exec(fileName)?.groups?.['instance'];
    return instance === undefined ? [] : [Number(instance)];
  });
}

/** Whether the record says ended while the very process it names still runs: an ended Watcher lingering for its acknowledgement. */
function endedWatcherStillRuns({ processSupervision }: PlatformPorts, record: WatcherRecord | null): record is WatcherRecord & { watcher: NonNullable<WatcherRecord['watcher']> } {
  if (record?.end === undefined || record.watcher === null) return false;
  const current = processSupervision.identityOf(record.watcher.processId);
  return current !== null && processSupervision.sameProcess(current, record.watcher);
}

/**
 * Acknowledges the end of every ended Watcher in the job folder and its process watchers' subfolders that still runs, so it exits: `close-input`
 * to a Watcher, `stop` to a process Watcher. A legacy Watcher is left alone. Answers how many took the acknowledgement.
 */
async function reapEndedHostsIn(ports: PlatformPorts, jobFolder: string): Promise<number> {
  let reaped = 0;
  for (const watcherFolder of watcherFoldersOf(jobFolder)) {
    for (const instance of claimedInstancesIn(watcherFolder)) {
      const record = watcherRecordOf(watcherFolder, instance);
      if (!endedWatcherStillRuns(ports, record) || LegacyWatcherReader.attachmentOf(record) === 'legacy-watcher') continue;
      const reading = readWatcherLaunch(watcherFilesOf(watcherFolder, instance).launchPath, ports.localEndpoint);
      if (reading.verdict !== 'read') continue;
      const acknowledgement: ActingFrame = reading.launch.kind === 'agent' ? { kind: 'close-input' } : { kind: 'stop', graceMilliseconds: 0 };
      if (await sendFrames(ports, watcherFolder, instance, [acknowledgement])) reaped += 1;
    }
  }
  return reaped;
}

/** Every job folder of the tracker, swept as `reapEndedHostsIn` says. */
async function reapEndedWatchers(ports: PlatformPorts, trackerDirectory: string): Promise<number> {
  let reaped = 0;
  for (const jobFolder of jobFoldersOf(trackerDirectory)) reaped += await reapEndedHostsIn(ports, jobFolder);
  return reaped;
}

interface StoppedProcessWatcher {
  readonly watcherFolder: string;
  readonly instance:      number;
  /** The tree before the stop: what still finds a member once the child that parented it died. */
  readonly treeMembers:   readonly ProcessTreeMember[];
}

function treeBeforeStopOf({ processSupervision }: PlatformPorts, watcherFolder: string, instance: number): readonly ProcessTreeMember[] {
  const leader = watcherRecordOf(watcherFolder, instance)?.childProcess ?? null;
  return leader === null ? [] : processSupervision.treeMembersOf(leader) ?? [];
}

/** A Watcher that names no child has no tree; a tree that cannot be read is not empty. */
function treeReadsEmpty({ processSupervision }: PlatformPorts, { watcherFolder, instance, treeMembers }: StoppedProcessWatcher): boolean {
  const leader = watcherRecordOf(watcherFolder, instance)?.childProcess ?? null;
  return leader === null || processSupervision.treeMembersOf(leader, treeMembers)?.length === 0;
}

/**
 * Sends `stop` with no grace to every live process Watcher of the tracker's jobs, an install or a gate, and waits a bounded number of tries for
 * each to record its end and its tree to read empty, so the reap after it acknowledges them. A Watcher and a legacy Watcher are left alone.
 * Answers how many have stopped: a Watcher whose tree still has a member is not one of them.
 */
async function stopLiveProcessWatchers(ports: PlatformPorts, trackerDirectory: string, stoppedWatcherWait: StoppedWatcherWait = STOPPED_WATCHER_WAIT): Promise<number> {
  const stopped: StoppedProcessWatcher[] = [];
  for (const jobFolder of jobFoldersOf(trackerDirectory)) {
    for (const watcherFolder of watcherFoldersOf(jobFolder)) {
      for (const instance of claimedInstancesIn(watcherFolder)) {
        if (livenessOf(ports, watcherFolder, instance).verdict !== 'live') continue;
        if (LegacyWatcherReader.attachmentOf(watcherRecordOf(watcherFolder, instance)) === 'legacy-watcher') continue;
        const reading = readWatcherLaunch(watcherFilesOf(watcherFolder, instance).launchPath, ports.localEndpoint);
        if (reading.verdict !== 'read' || reading.launch.kind !== 'process') continue;
        const treeMembers = treeBeforeStopOf(ports, watcherFolder, instance);
        if (await sendFrames(ports, watcherFolder, instance, [{ kind: 'stop', graceMilliseconds: 0 }])) stopped.push({ watcherFolder, instance, treeMembers });
      }
    }
  }
  const hasStopped = (watcher: StoppedProcessWatcher): boolean => livenessOf(ports, watcher.watcherFolder, watcher.instance).verdict !== 'live' && treeReadsEmpty(ports, watcher);
  // The tries only bound the wait; whether a Watcher ended is its own record, and whether its tree did is the process table.
  for (let attempt = 0; attempt < stoppedWatcherWait.tries; attempt += 1) {
    if (stopped.every(hasStopped)) break;
    await Bun.sleep(stoppedWatcherWait.intervalMilliseconds);
  }
  return stopped.filter(hasStopped).length;
}

function jobFoldersOf(trackerDirectory: string): string[] {
  try {
    return readdirSync(join(trackerDirectory, 'jobs')).map((jobId) => jobFolderOf(trackerDirectory, jobId));
  } catch {
    return [];
  }
}

/** The job folder itself, holding its Watcher, and each subfolder, holding a process Watcher. */
function watcherFoldersOf(jobFolder: string): string[] {
  try {
    const subfolderNames = readdirSync(jobFolder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    return [jobFolder, ...subfolderNames.map((name) => join(jobFolder, name))];
  } catch {
    return [];
  }
}

export const WatcherFleet = Object.freeze({
  jobFolderOf,
  watcherRecordOf,
  livenessOf,
  eventsAfter,
  unfitEndpointOf,
  writeLaunchFiles,
  writeProcessLaunchFile,
  sendFrames,
  sendFramesOnce,
  spawnWatcher,
  watcherSpawnOptionsOf,
  reapEndedHostsIn,
  reapEndedWatchers,
  stopLiveProcessWatchers,
});
