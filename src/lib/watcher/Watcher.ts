/**
 * A thin Watcher: claims one instance of a job by creating its Watcher file exclusively, runs the one child its launch file names under the
 * port's spawn options, logs every line to and from it, speaks protocol 1 on its socket, and records how the child ended. It writes its job
 * folder, its socket and the child's stdin and nothing else.
 * It depends on `src/lib/atomic-file`, `src/lib/owner-only-files` and `src/lib/process-identity`.
 */
import {
  appendFileSync,
  closeSync,
  openSync,
  readFileSync
} from 'node:fs';

import { createWholeFileAtomically, writeFileAtomically }               from '../atomic-file/AtomicFile.ts';
import type { ExclusiveCreation, FileReplace }                          from '../atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess }                                     from '../atomic-file/FileReplaceFor.ts';
import type { ProcessIdentity }                                         from '../process-identity/ProcessIdentity.ts';
import type { ProcessStopStage, ProcessSupervision, ProcessTreeMember } from '../process-identity/ProcessSupervision.ts';
import { processSupervisionFor }                                        from '../process-identity/ProcessSupervisionFor.ts';
import type { ActingFrame, WatcherActivity }                            from './@types/WatcherFrame.ts';
import {
  type EventLogEntry,
  type EventLogWriter,
  type EventOrigin,
  createEventLogWriter,
  eventLogEntriesOf
} from './EventLog.ts';
import type { LocalEndpoint }                                       from './LocalEndpoint.ts';
import { localEndpointFor }                                         from './LocalEndpointFor.ts';
import { standingReplyFor }                                         from './StandingReplies.ts';
import { type WatcherFiles, watcherFilesOf }                        from './WatcherFiles.ts';
import { type WatcherLaunch, readWatcherLaunch, readWatcherSecret } from './WatcherLaunch.ts';
import { type WatcherEnd, type WatcherRecord, watcherRecordTextOf } from './WatcherRecord.ts';
import { type WatcherSocketServer, listenOnWatcherSocket }          from './WatcherSocketServer.ts';
import {
  CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS,
  EVENT_LOG_FORMAT_VERSION,
  WATCHER_LINGER_FRAMES,
  WATCHER_PROTOCOL_VERSION
} from './constants/WatcherProtocol.ts';

const WATCHER_DONE_EXIT_CODE    = 0;
const WATCHER_REFUSED_EXIT_CODE = 1;

const INSTANCE_PATTERN = /^[1-9]\d*$/;

const STDOUT_LINE_SEPARATOR = '\n';

const TREE_SWEEP_INTERVAL_MILLISECONDS = 100;
const TREE_SWEEP_ATTEMPTS              = 20;

const WATCHER_FRAMES: readonly ActingFrame['kind'][] = ['write', 'close-input', 'stop'];
const PROCESS_WATCHER_FRAMES: readonly ActingFrame['kind'][] = ['stop'];

interface ChildStdin {
  readonly write: (text: string) => unknown;
  readonly flush: () => unknown;
  readonly end:   () => unknown;
}

function writeLineToChild(stdin: ChildStdin | null, line: string): void {
  if (stdin === null) return;
  try {
    stdin.write(`${line}\n`);
    stdin.flush();
  } catch {
    // A child that closed its stdin or exited ends the run through its exit, not through this write.
  }
}

function closeChildInput(stdin: ChildStdin | null): void {
  if (stdin === null) return;
  try {
    stdin.end();
  } catch {
    // Already closed, by an earlier frame or by the child's exit.
  }
}

/** Each complete line of the stream as it arrives, then an unterminated tail as the last line. */
async function forEachLine(stream: ReadableStream<Uint8Array>, consumeLine: (line: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true });
    let separatorIndex = pending.indexOf(STDOUT_LINE_SEPARATOR);
    while (separatorIndex !== -1) {
      consumeLine(pending.slice(0, separatorIndex));
      pending = pending.slice(separatorIndex + 1);
      separatorIndex = pending.indexOf(STDOUT_LINE_SEPARATOR);
    }
  }
  pending += decoder.decode();
  if (pending.length > 0) consumeLine(pending);
}

/** Bytes as they arrive, so a child's partial lines stay as it wrote them; nothing here may end the Watcher. */
async function appendStreamToLog(stream: ReadableStream<Uint8Array>, logPath: string): Promise<void> {
  try {
    for await (const chunk of stream) appendFileSync(logPath, chunk);
  } catch {
    // A log that cannot be written, or a stream that broke, costs only these lines.
  }
}

function endedRecordOf(record: WatcherRecord, end: WatcherEnd): WatcherRecord {
  return { ...record, state: 'ended', end };
}

function readDurableEntries(eventLogPath: string): readonly EventLogEntry[] {
  const reading = eventLogEntriesOf(readFileSync(eventLogPath, 'utf8'));
  // Only this Watcher writes the log, so a malformed line is damage on the disk; the live messages still reach the client.
  return reading.verdict === 'read' ? reading.entries : [];
}

/** What the child's supervision and the socket share while the child runs and after it ended. */
export interface WatcherSession {
  activity:        WatcherActivity;
  childStdin:      ChildStdin | null;
  childLeader:     ProcessIdentity | null;
  /** The child's tree at its last listing: what still reaches a group once the child that parented it died. */
  treeMembers:     readonly ProcessTreeMember[];
  end:             WatcherEnd | null;
  lingerFrames:    number;
  logClosed:       boolean;
  finishLinger:    () => void;
  /** Settles once a stop sent its last signal; `null` while no stop was asked for. */
  stopSignalsSent: Promise<void> | null;
  /** A `force` reached the tree: what `endOf` needs where the runtime reports a kill from outside as an exit. */
  forcedStopRan:   boolean;
}

export function createWatcherSession(): { session: WatcherSession; lingered: Promise<void> } {
  let finishLinger = (): void => undefined;
  const lingered = new Promise<void>((resolve) => {
    finishLinger = resolve;
  });
  return {
    session: {
      activity:        'idle',
      childStdin:      null,
      childLeader:     null,
      treeMembers:     [],
      end:             null,
      lingerFrames:    0,
      logClosed:       false,
      finishLinger,
      stopSignalsSent: null,
      forcedStopRan:   false,
    },
    lingered,
  };
}

/** The ports a Watcher works through, chosen once from the platform its binary was told; the file moves default to this process's. */
export interface WatcherPorts {
  readonly supervision:  ProcessSupervision;
  readonly endpoint:     LocalEndpoint;
  readonly fileReplace?: FileReplace;
}

export interface WatcherParts {
  readonly ports:    WatcherPorts;
  readonly launch:   WatcherLaunch;
  readonly files:    WatcherFiles;
  readonly eventLog: EventLogWriter;
  readonly session:  WatcherSession;
  readonly server:   WatcherSocketServer;
}

function appendAndBroadcast(parts: WatcherParts, origin: EventOrigin, line: string): void {
  const entry = parts.eventLog.append(origin, line);
  parts.server.broadcast({ kind: 'message', entry });
}

function changeActivity(parts: WatcherParts, activity: WatcherActivity): void {
  if (parts.session.activity === activity) return;
  parts.session.activity = activity;
  parts.server.broadcast({ kind: 'state', state: activity, ...(parts.session.end === null ? {} : { end: parts.session.end }) });
}

/** This listing, or `[]` when it cannot be read: the kept listing only finds groups again, because a signal needs a fresh answer. */
function listChildTree({ ports, session }: WatcherParts): readonly ProcessTreeMember[] {
  if (session.childLeader === null) return [];
  const listing = ports.supervision.treeMembersOf(session.childLeader, session.treeMembers);
  if (listing === null) return [];
  session.treeMembers = listing;
  return listing;
}

/** The verdict goes to the Watcher log alone: the stop goes on through its stages whatever one of them answered. */
function stopChildTree(parts: WatcherParts, stage: ProcessStopStage): void {
  const { ports, session, files } = parts;
  if (session.childLeader === null) return;
  const outcome = ports.supervision.stopTree(session.childLeader, stage, listChildTree(parts));
  // A refusal can leave one member alive after the rest died, the child among them.
  if (stage === 'force' && (outcome.verdict === 'signalled' || outcome.verdict === 'refused')) session.forcedStopRan = true;
  try {
    appendFileSync(files.watcherLogPath, `stop ${stage}: ${outcome.verdict}${outcome.verdict === 'refused' ? ` (${outcome.reason})` : ''}\n`);
  } catch {
    // A log that cannot be written must not end the Watcher before its next stage.
  }
}

/** `force` again until the listing is empty, since a member still being killed can have started another; the attempts end it regardless. */
function sweepChildTree(parts: WatcherParts, attemptsLeft: number, finished: () => void): void {
  stopChildTree(parts, 'force');
  setTimeout(() => {
    listChildTree(parts);
    if (parts.session.treeMembers.length === 0 || attemptsLeft <= 1) finished();
    else sweepChildTree(parts, attemptsLeft - 1, finished);
  }, TREE_SWEEP_INTERVAL_MILLISECONDS);
}

/**
 * Lists the child's tree and closes stdin at once, in that order, because the walk through parent ids finds nothing once the child died.
 * Then `ask` and `force` to the tree each after the grace, also once the child itself ended, so a member that outlives it is killed; the
 * Watcher exits only after both.
 */
function stopChild(parts: WatcherParts, graceMilliseconds: number): void {
  const { session } = parts;
  if (session.stopSignalsSent !== null) return;
  if (session.end === null) changeActivity(parts, 'stopping');
  listChildTree(parts);
  closeChildInput(session.childStdin);
  // The graces only schedule the signals; whether to send one is the group's checked identity.
  session.stopSignalsSent = new Promise((resolve) => {
    setTimeout(() => {
      stopChildTree(parts, 'ask');
      setTimeout(() => sweepChildTree(parts, TREE_SWEEP_ATTEMPTS, resolve), graceMilliseconds);
    }, graceMilliseconds);
  });
}

/**
 * An ended Watcher acts only on an agent's `stop`, since `close-input` can end the child before the stop that follows it, and the last listing
 * still reaches the groups below it. The acknowledgement is `close-input` for a Watcher and `stop` for a process Watcher.
 */
export function actOnFrame(parts: WatcherParts, frame: ActingFrame): void {
  const { session, launch } = parts;
  if (session.end !== null) {
    const acknowledgement: ActingFrame['kind'] = launch.kind === 'agent' ? 'close-input' : 'stop';
    if (frame.kind === 'stop' && launch.kind === 'agent') stopChild(parts, frame.graceMilliseconds);
    if (frame.kind === acknowledgement) session.finishLinger();
    return;
  }
  appendAndBroadcast(parts, 'client', JSON.stringify(frame));
  switch (frame.kind) {
    case 'write':
      writeLineToChild(session.childStdin, frame.line);
      return;
    case 'close-input':
      // A stop that follows this frame may find the child dead, and with it the only way to the groups below it.
      listChildTree(parts);
      closeChildInput(session.childStdin);
      if (session.activity === 'busy') changeActivity(parts, 'idle');
      return;
    case 'stop':
      stopChild(parts, frame.graceMilliseconds);
  }
}

function countLingerFrame(session: WatcherSession): void {
  if (session.end === null) return;
  session.lingerFrames += 1;
  if (session.lingerFrames >= WATCHER_LINGER_FRAMES) session.finishLinger();
}

interface SupervisedChild {
  /** The record as it stood when the child ended, so `end` is added to what it said about the child. */
  readonly lastRecord: WatcherRecord;
  readonly end:        WatcherEnd;
}

async function superviseChild(parts: WatcherParts, launchedRecord: WatcherRecord): Promise<SupervisedChild> {
  const {
    ports: { supervision }, launch, files, session
  } = parts;
  const watcherLogDescriptor = openSync(files.watcherLogPath, 'a');
  let child: Bun.Subprocess<'pipe' | 'ignore', 'pipe', number | 'pipe'>;
  try {
    child = Bun.spawn({
      cmd:                      [...launch.argv],
      cwd:                      launch.workingDirectory,
      env:                      { ...launch.environment },
      stdin:                    launch.kind === 'agent' ? 'pipe' : 'ignore',
      stdout:                   'pipe',
      stderr:                   watcherLogDescriptor,
      windowsVerbatimArguments: launch.verbatimArguments === true,
      ...supervision.spawnOptionsFor('supervised-child'),
    });
  } catch (error) {
    return {
      lastRecord: launchedRecord,
      end:        {
        reason: 'spawn-failed', exitCode: null, signal: null, detail: String(error)
      },
    };
  } finally {
    closeSync(watcherLogDescriptor);
  }
  // Taken as the child ends: a descendant can hold stdout open past that, and a force after the child's own end is no cause of it.
  const forcedStopRanBeforeTheEnd = child.exited.then(() => session.forcedStopRan);
  // The child's pid leads the tree a stop reaches, whatever the platform calls that tree.
  session.childLeader = supervision.identityOf(child.pid);
  const runningRecord: WatcherRecord = {
    ...launchedRecord, state: 'running', childProcess: session.childLeader, childProcessGroupId: child.pid,
  };
  writeFileAtomically(files.watcherRecordPath, watcherRecordTextOf(runningRecord));
  session.childStdin = launch.kind === 'agent' && typeof child.stdin === 'object' ? child.stdin : null;
  const childStandardError = child.stderr as ReadableStream<Uint8Array> | number | undefined;
  const standardErrorLogged = childStandardError instanceof ReadableStream ? appendStreamToLog(childStandardError, files.watcherLogPath) : null;
  await forEachLine(child.stdout, (line) => {
    appendAndBroadcast(parts, 'agent', line);
    if (session.activity === 'idle') changeActivity(parts, 'busy');
    const reply = standingReplyFor(line, launch.standingReplies);
    if (reply === null || session.childStdin === null) return;
    appendAndBroadcast(parts, 'watcher', reply);
    writeLineToChild(session.childStdin, reply);
  });
  const exitCode = await child.exited;
  // A descendant may keep stderr open past the child's end, so the wait is bounded; later bytes still reach the log while the Watcher lingers.
  if (standardErrorLogged !== null) await Promise.race([standardErrorLogged, Bun.sleep(CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS)]);
  return { lastRecord: runningRecord, end: supervision.endOf({ exitCode, signalCode: child.signalCode, forcedStopRan: await forcedStopRanBeforeTheEnd }) };
}

/** `null` for arguments that name no job folder and instance: nothing can be claimed for them. */
function watcherFilesOfArguments(watcherArguments: readonly string[]): { files: WatcherFiles; instance: number } | null {
  const [jobFolder, instanceText] = watcherArguments;
  if (jobFolder === undefined || jobFolder === '' || instanceText === undefined || !INSTANCE_PATTERN.test(instanceText)) return null;
  const instance = Number(instanceText);
  return { files: watcherFilesOf(jobFolder, instance), instance };
}

/** A reader sees the claim whole or absent; where it cannot be created whole, as where hard links fail, nothing is recorded. */
function claimWhole(watcherRecordPath: string, text: string, fileReplace: FileReplace): ExclusiveCreation | 'not-created-whole' {
  try {
    return createWholeFileAtomically(watcherRecordPath, text, fileReplace);
  } catch {
    return 'not-created-whole';
  }
}

/** The Watcher's parts once its socket listens, or why it cannot. */
async function listenFor(
  ports: WatcherPorts,
  launch: WatcherLaunch,
  watcherSecret: string,
  files: WatcherFiles,
  eventLog: EventLogWriter,
  session: WatcherSession,
): Promise<WatcherParts | string> {
  const preparation = ports.endpoint.prepareEndpoint(launch.socketPath);
  if (preparation.verdict === 'refused') return `the socket folder cannot be prepared: ${preparation.reason}`;
  let parts: WatcherParts | null = null;
  const listening = await listenOnWatcherSocket({
    endpoint:       ports.endpoint,
    socketPath:     launch.socketPath,
    watcherSecret,
    acceptedKinds:  launch.kind === 'agent' ? WATCHER_FRAMES : PROCESS_WATCHER_FRAMES,
    welcomeOf:      () => ({ watcherCodeVersion: launch.watcherCodeVersion, jobId: launch.jobId, state: session.activity }),
    durableEntries: () => {
      if (!session.logClosed) eventLog.sync();
      return readDurableEntries(files.eventLogPath);
    },
    onClientLine:  () => countLingerFrame(session),
    onActingFrame: (frame) => {
      if (parts !== null) actOnFrame(parts, frame);
    },
  });
  if (listening.verdict === 'unbindable') return listening.reason;
  parts = {
    ports, launch, files, eventLog, session, server: listening.server,
  };
  return parts;
}

/**
 * Runs `<job folder> <instance>` to the end and returns the exit code; it never exits. A second Watcher of a claimed instance returns 0
 * without spawning anything, so a re-spawn of the same instance is safe. A Watcher whose child ran keeps its socket after the end until the
 * acknowledgement or `WATCHER_LINGER_FRAMES` client frames. It has no command context, so it chooses its own ports from `platform`.
 */
export async function runWatcher(watcherArguments: readonly string[], stampNow: () => string, platform: string): Promise<number> {
  // A Watcher binds the endpoint its launch file names and never draws one, so it has no pipe name prefix to give.
  return runWatcherOnPorts(watcherArguments, stampNow, { supervision: processSupervisionFor(platform), endpoint: localEndpointFor(platform, '') });
}

export async function runWatcherOnPorts(watcherArguments: readonly string[], stampNow: () => string, ports: WatcherPorts): Promise<number> {
  const target = watcherFilesOfArguments(watcherArguments);
  if (target === null) return WATCHER_REFUSED_EXIT_CODE;
  const { files, instance } = target;
  const claimedRecord: WatcherRecord = {
    protocolVersion:       WATCHER_PROTOCOL_VERSION,
    eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION,
    watcherInstance:       instance,
    state:                 'claimed',
    watcher:               ports.supervision.identityOf(process.pid),
  };
  const claim = claimWhole(files.watcherRecordPath, watcherRecordTextOf(claimedRecord), ports.fileReplace ?? fileReplaceOfThisProcess());
  if (claim === 'already-exists') return WATCHER_DONE_EXIT_CODE;
  if (claim === 'not-created-whole') return WATCHER_REFUSED_EXIT_CODE;
  const launchReading = readWatcherLaunch(files.launchPath, ports.endpoint);
  const watcherSecret = launchReading.verdict === 'read' ? readWatcherSecret(launchReading.launch.secretFilePath) : null;
  if (launchReading.verdict === 'unreadable' || watcherSecret === null) {
    const detail = launchReading.verdict === 'unreadable' ? launchReading.reason : 'the Watcher secret cannot be read';
    writeFileAtomically(files.watcherRecordPath, watcherRecordTextOf(endedRecordOf(claimedRecord, {
      reason: 'launch-unreadable', exitCode: null, signal: null, detail,
    })));
    return WATCHER_REFUSED_EXIT_CODE;
  }
  const { launch } = launchReading;
  const launchedRecord: WatcherRecord = { ...claimedRecord, watcherCodeVersion: launch.watcherCodeVersion, socketPath: launch.socketPath };
  const eventLog = createEventLogWriter(files.eventLogPath, stampNow);
  const { session, lingered } = createWatcherSession();
  const parts = await listenFor(ports, launch, watcherSecret, files, eventLog, session);
  if (typeof parts === 'string') {
    eventLog.syncAndClose();
    writeFileAtomically(files.watcherRecordPath, watcherRecordTextOf(endedRecordOf(launchedRecord, {
      reason: 'socket-unbindable', exitCode: null, signal: null, detail: parts,
    })));
    return WATCHER_REFUSED_EXIT_CODE;
  }
  const { server } = parts;
  const { lastRecord, end } = await superviseChild(parts, launchedRecord);
  eventLog.syncAndClose();
  session.logClosed = true;
  writeFileAtomically(files.watcherRecordPath, watcherRecordTextOf(endedRecordOf(lastRecord, end)));
  if (end.reason === 'spawn-failed') {
    server.close();
    return WATCHER_REFUSED_EXIT_CODE;
  }
  session.end = end;
  changeActivity(parts, 'ended');
  await lingered;
  server.close();
  await session.stopSignalsSent;
  return WATCHER_DONE_EXIT_CODE;
}
