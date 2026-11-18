/**
 * The children of one Talos: each launched line runs under the port's spawn, its stdout lines go to its event log, its stderr to its log,
 * and its record follows it from `starting` to `ended`. A stop lists the tree first and signals it through the synchronous-calls thread; a
 * line past its time bound is stopped, the gaps in Talos's ticks added to its allowance and left out of its run time. It runs lines only.
 */
import type { ProcessIdentity }                       from '../process-identity/ProcessIdentity.ts';
import type { ProcessStopStage, ProcessTreeMember }   from '../process-identity/ProcessSupervision.ts';
import type { FrameRefusalReason, StateFrame }        from './@types/TalosFrame.ts';
import { childIdOf, childLaunchOf, type ChildLaunch } from './ChildLaunch.ts';
import {
  type ChildEnd,
  type ChildRecord,
  childRecordTextOf,
  type ChildState
} from './ChildRecord.ts';
import type { EventOrigin }                                                                               from './EventLog.ts';
import type { LaunchRegistry }                                                                            from './LaunchRegistry.ts';
import { forEachLine }                                                                                    from './StreamLines.ts';
import { gapLengthOf }                                                                                    from './SupervisionLease.ts';
import type { SynchronousCalls }                                                                          from './SynchronousCallsClient.ts';
import { type ChildFiles, childFilesOf }                                                                  from './TalosFiles.ts';
import { CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS, CHILD_RECORD_FORMAT_VERSION, EVENT_LOG_FORMAT_VERSION } from './constants/TalosProtocol.ts';

const TREE_SWEEP_INTERVAL_MILLISECONDS = 100;
const TREE_SWEEP_ATTEMPTS              = 20;

export interface ChildSpawnRequest {
  readonly argv:              readonly string[];
  readonly workingDirectory:  string;
  readonly environment:       Readonly<Record<string, string>>;
  readonly verbatimArguments: boolean;
}

/** A child as the spawn port gives it: its stdin is closed, its stdout and stderr are piped. */
export interface SpawnedChild {
  readonly processId:      number;
  readonly standardOutput: ReadableStream<Uint8Array>;
  readonly standardError:  ReadableStream<Uint8Array> | null;
  readonly exited:         Promise<number | null>;
  /** Read once `exited` settled. */
  readonly signalCode:     () => string | null;
}

export interface ChildSupervisorContext {
  readonly boardFolder:         string;
  readonly startNumber:         number;
  readonly talos:               ProcessIdentity | null;
  /** Calls whose failure ends Talos: a failed one never settles here. */
  readonly calls:               SynchronousCalls;
  readonly launchRegistry:      LaunchRegistry;
  /** Throws when no child can be started; the throw is the child's `spawn-failed` end. */
  readonly spawnChild:          (request: ChildSpawnRequest) => SpawnedChild;
  /** Talos's own variable of a name, which a launch's `environmentFromTalos` copies into the child; absent copies nothing. */
  readonly ownVariableOf:       (name: string) => string | undefined;
  readonly stampNow:            () => string;
  readonly wallNowMilliseconds: () => number;
  readonly tickMilliseconds:    number;
  readonly talosLogPath:        string;
  readonly broadcastState:      (frame: StateFrame) => void;
  /** A throw nothing else catches, which ends Talos as a failed call does. */
  readonly fail:                (cause: unknown) => void;
}

export type ChildFrameVerdict =
  | { verdict: 'done' | 'already-done' }
  | { verdict: 'refused'; reason: FrameRefusalReason };

export interface ChildSupervisor {
  /** Answers once the child runs, or once it ended without running. */
  readonly launch:         (launchValue: unknown) => Promise<ChildFrameVerdict>;
  readonly stop:           (childId: string, graceMilliseconds: number) => ChildFrameVerdict;
  readonly input:          (childId: string) => ChildFrameVerdict;
  readonly stopLines:      () => ChildFrameVerdict;
  readonly ticked:         (wallNowMilliseconds: number) => void;
  /** The clean quit's part for lines: launches in flight finish, then every live line is stopped at once and ends `paused`. */
  readonly pauseEveryLine: () => Promise<void>;
}

type EndReasonOverride = 'time-bound' | 'paused';

interface SupervisedChild {
  readonly childId:                string;
  readonly launch:                 ChildLaunch;
  readonly files:                  ChildFiles;
  record:                          ChildRecord;
  leader:                          ProcessIdentity | null;
  /** The tree at its last listing: what still reaches a group once the child that parented it died. */
  treeMembers:                     readonly ProcessTreeMember[];
  /** Settles once a stop sent its last signal; `null` while no stop was asked for. */
  stopSignalsSent:                 Promise<void> | null;
  /** A `force` reached the tree: what `endOf` needs where the runtime reports a kill from outside as an exit. */
  forcedStopRan:                   boolean;
  exited:                          boolean;
  endReasonOverride:               EndReasonOverride | null;
  spawnWallMilliseconds:           number | null;
  allowanceEndsAtWallMilliseconds: number | null;
  gapsMilliseconds:                number;
  lastSequence:                    number;
  /** Settles once the launch read the child's identity and wrote it: a stop asked for during the launch waits for the leader it signals. */
  running:                         Promise<void>;
  ended:                           Promise<void>;
}

function childEnvironmentOf(launch: ChildLaunch, ownVariableOf: (name: string) => string | undefined): Record<string, string> {
  const copied = Object.entries(launch.environmentFromTalos)
    .map(([childName, ownName]) => [childName, ownVariableOf(ownName) ?? ''] as const)
    .filter(([, value]) => value !== '');
  return { ...launch.environment, ...Object.fromEntries(copied) };
}

export function createChildSupervisor(context: ChildSupervisorContext): ChildSupervisor {
  const { calls } = context;
  const children = new Map<string, SupervisedChild>();
  const launchesInFlight = new Set<Promise<unknown>>();
  let lastTickWallMilliseconds = context.wallNowMilliseconds();
  let pausing = false;

  const isLive = (child: SupervisedChild): boolean => child.record.state !== 'ended' && !child.exited;

  function logLine(text: string): void {
    void calls.appendText(context.talosLogPath, `${text}\n`);
  }

  /** Written first, then broadcast, so a client that hears of a state reads it in the record. */
  async function changeRecord(child: SupervisedChild, changes: Partial<ChildRecord>): Promise<void> {
    child.record = { ...child.record, ...changes };
    const changedRecord = child.record;
    await calls.writeRecord(child.files.recordPath, childRecordTextOf(changedRecord), false);
    context.broadcastState({
      kind: 'state', childId: child.childId, state: changedRecord.state, end: changedRecord.end, recognisedEnding: null
    });
  }

  function appendEvent(child: SupervisedChild, origin: EventOrigin, line: string): void {
    child.lastSequence += 1;
    void calls.appendEvent(child.files.eventLogPath, {
      sequence: child.lastSequence, origin, line, at: context.stampNow()
    });
  }

  /** This listing, or `[]` when it cannot be read: the kept listing only finds groups again, because a signal needs a fresh answer. */
  async function listTree(child: SupervisedChild): Promise<readonly ProcessTreeMember[]> {
    if (child.leader === null) return [];
    const listing = await calls.treeMembersOf(child.leader, child.treeMembers);
    if (listing === null) return [];
    child.treeMembers = listing;
    return listing;
  }

  /** The verdict goes to the Talos log alone: the stop goes on through its stages whatever one of them answered. */
  async function stopTree(child: SupervisedChild, stage: ProcessStopStage): Promise<void> {
    if (child.leader === null) return;
    const outcome = await calls.stopTree(child.leader, stage, await listTree(child));
    // A refusal can leave one member alive after the rest died, the child among them.
    if (stage === 'force' && (outcome.verdict === 'signalled' || outcome.verdict === 'refused')) child.forcedStopRan = true;
    logLine(`stop ${stage} ${child.childId}: ${outcome.verdict}${outcome.verdict === 'refused' ? ` (${outcome.reason})` : ''}`);
  }

  /** `force` again until the listing is empty, since a member still being killed can have started another; the attempts end it regardless. */
  async function sweepTree(child: SupervisedChild): Promise<void> {
    for (let attempt = 1; attempt <= TREE_SWEEP_ATTEMPTS; attempt += 1) {
      await stopTree(child, 'force');
      await Bun.sleep(TREE_SWEEP_INTERVAL_MILLISECONDS);
      if ((await listTree(child)).length === 0) return;
    }
  }

  /** The tree is listed first, because the walk through parent ids finds nothing once the child died; `ask` and `force` follow, each after the grace. */
  function stopChild(child: SupervisedChild, graceMilliseconds: number): void {
    if (child.stopSignalsSent !== null) return;
    if (isLive(child)) void changeRecord(child, { state: 'stopping' });
    child.stopSignalsSent = (async (): Promise<void> => {
      await child.running;
      await listTree(child);
      await Bun.sleep(graceMilliseconds);
      await stopTree(child, 'ask');
      await Bun.sleep(graceMilliseconds);
      await sweepTree(child);
    })();
    child.stopSignalsSent.catch(context.fail);
  }

  async function endChild(child: SupervisedChild, end: ChildEnd): Promise<void> {
    await calls.syncAndCloseEventLog(child.files.eventLogPath);
    // A reader that sees `ended` has the whole log: the log is synced and closed first.
    await changeRecord(child, { state: 'ended', end });
  }

  async function appendStandardError(stream: ReadableStream<Uint8Array> | null, standardErrorPath: string): Promise<void> {
    if (stream === null) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        if (text !== '') void calls.appendText(standardErrorPath, text);
      }
    } catch {
      // A stream that broke costs only these bytes.
    }
    const tail = decoder.decode();
    if (tail !== '') void calls.appendText(standardErrorPath, tail);
  }

  /** The gap since the later of the last tick and the spawn, so time before a child ran is never left out of its run. */
  function gapSinceLastTickOf(child: SupervisedChild, wallNowMilliseconds: number): number {
    const from = Math.max(lastTickWallMilliseconds, child.spawnWallMilliseconds ?? lastTickWallMilliseconds);
    return gapLengthOf(from, wallNowMilliseconds, context.tickMilliseconds);
  }

  async function superviseUntilEnd(child: SupervisedChild, spawned: SpawnedChild): Promise<void> {
    // Taken as the child ends: a descendant can hold stdout open past that, and a force after the child's own end is no cause of it.
    const forcedStopRanAtTheEnd = spawned.exited.then(() => child.forcedStopRan);
    const standardErrorAppended = appendStandardError(spawned.standardError, child.files.standardErrorPath);
    await forEachLine(spawned.standardOutput, (line) => appendEvent(child, 'agent', line));
    const exitCode = await spawned.exited;
    child.exited = true;
    // A descendant may keep stderr open past the child's end, so the wait is bounded; later bytes still reach the log.
    await Promise.race([standardErrorAppended, Bun.sleep(CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS)]);
    const processEnd = await calls.endOf(exitCode, spawned.signalCode(), await forcedStopRanAtTheEnd);
    const endWallMilliseconds = context.wallNowMilliseconds();
    const spawnWallMilliseconds = child.spawnWallMilliseconds ?? endWallMilliseconds;
    const runMilliseconds = endWallMilliseconds - spawnWallMilliseconds - child.gapsMilliseconds - gapSinceLastTickOf(child, endWallMilliseconds);
    await child.running;
    await endChild(child, {
      reason:          child.endReasonOverride ?? processEnd.reason,
      exitCode:        processEnd.exitCode,
      signal:          processEnd.signal,
      detail:          null,
      runMilliseconds: Math.max(0, runMilliseconds),
    });
  }

  function startedRecordOf(launch: ChildLaunch, childId: string): ChildRecord {
    return {
      formatVersion:         CHILD_RECORD_FORMAT_VERSION,
      childId,
      kind:                  launch.kind,
      label:                 launch.label,
      workingDirectory:      launch.workingDirectory,
      talosStartNumber:      context.startNumber,
      talos:                 context.talos,
      state:                 'starting',
      childProcess:          null,
      childProcessGroupId:   null,
      eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION,
      timeBoundMilliseconds: launch.timeBoundMilliseconds,
      recognisedEndings:     [],
      end:                   null,
    };
  }

  async function launchRegistered(launch: ChildLaunch, childId: string): Promise<ChildFrameVerdict> {
    const child: SupervisedChild = {
      childId,
      launch,
      files:                           childFilesOf(context.boardFolder, launch.childFolder, launch.instance),
      record:                          startedRecordOf(launch, childId),
      leader:                          null,
      treeMembers:                     [],
      stopSignalsSent:                 null,
      forcedStopRan:                   false,
      exited:                          false,
      endReasonOverride:               null,
      spawnWallMilliseconds:           null,
      allowanceEndsAtWallMilliseconds: null,
      gapsMilliseconds:                0,
      lastSequence:                    0,
      running:                         Promise.resolve(),
      ended:                           Promise.resolve(),
    };
    // The label and the id only: a launch carries the child's whole environment, its login variables among it.
    logLine(`launch ${childId}: ${launch.label}`);
    await changeRecord(child, {});
    await calls.openEventLog(child.files.eventLogPath);
    let spawned: SpawnedChild;
    try {
      spawned = context.spawnChild({
        argv:              launch.argv,
        workingDirectory:  launch.workingDirectory,
        environment:       childEnvironmentOf(launch, context.ownVariableOf),
        verbatimArguments: launch.verbatimArguments,
      });
    } catch (error) {
      children.set(childId, child);
      child.exited = true;
      await endChild(child, {
        reason: 'spawn-failed', exitCode: null, signal: null, detail: String(error), runMilliseconds: 0
      });
      return { verdict: 'done' };
    }
    child.spawnWallMilliseconds = context.wallNowMilliseconds();
    if (launch.timeBoundMilliseconds !== null) child.allowanceEndsAtWallMilliseconds = child.spawnWallMilliseconds + launch.timeBoundMilliseconds;
    children.set(childId, child);
    let markRunning = (): void => undefined;
    child.running = new Promise((resolve) => {
      markRunning = resolve;
    });
    child.ended = superviseUntilEnd(child, spawned);
    child.ended.catch(context.fail);
    // The child's pid leads the tree a stop reaches, whatever the platform calls that tree.
    child.leader = await calls.identityOf(spawned.processId);
    const state: ChildState = child.stopSignalsSent === null ? 'running' : 'stopping';
    await changeRecord(child, { state, childProcess: child.leader, childProcessGroupId: spawned.processId });
    markRunning();
    return { verdict: 'done' };
  }

  async function launchOf(launchValue: unknown): Promise<ChildFrameVerdict> {
    if (pausing) return { verdict: 'refused', reason: 'quitting' };
    const reading = childLaunchOf(launchValue, context.boardFolder);
    if (reading.verdict === 'refused') return { verdict: 'refused', reason: reading.reason };
    const { launch } = reading;
    // This supervisor runs lines only, so an agent's launch is one it cannot carry out.
    if (launch.kind === 'agent') return { verdict: 'refused', reason: 'malformed-launch' };
    const registration = context.launchRegistry.registered(launch);
    if (registration.verdict === 'already-launched') return { verdict: 'already-done' };
    await registration.appended;
    return launchRegistered(launch, childIdOf(launch.childFolder, launch.instance));
  }

  function stop(childId: string, graceMilliseconds: number): ChildFrameVerdict {
    const child = children.get(childId);
    if (child === undefined) return { verdict: 'refused', reason: 'unknown-child' };
    if (!isLive(child) || child.stopSignalsSent !== null) return { verdict: 'already-done' };
    stopChild(child, graceMilliseconds);
    return { verdict: 'done' };
  }

  function ticked(wallNowMilliseconds: number): void {
    for (const child of children.values()) {
      if (!isLive(child) || child.spawnWallMilliseconds === null) continue;
      const gapMilliseconds = gapSinceLastTickOf(child, wallNowMilliseconds);
      child.gapsMilliseconds += gapMilliseconds;
      if (child.allowanceEndsAtWallMilliseconds === null) continue;
      child.allowanceEndsAtWallMilliseconds += gapMilliseconds;
      if (wallNowMilliseconds < child.allowanceEndsAtWallMilliseconds || child.stopSignalsSent !== null) continue;
      child.endReasonOverride = 'time-bound';
      stopChild(child, 0);
    }
    lastTickWallMilliseconds = wallNowMilliseconds;
  }

  return Object.freeze({
    launch: (launchValue: unknown) => {
      const launching = launchOf(launchValue);
      launchesInFlight.add(launching);
      void launching.finally(() => launchesInFlight.delete(launching));
      return launching;
    },
    stop,
    input:     (childId: string): ChildFrameVerdict => ({ verdict: 'refused', reason: children.has(childId) ? 'kind-takes-no-input' : 'unknown-child' }),
    stopLines: (): ChildFrameVerdict => {
      for (const child of children.values()) if (child.launch.kind === 'line' && isLive(child)) stopChild(child, 0);
      return { verdict: 'done' };
    },
    ticked,
    pauseEveryLine: async () => {
      pausing = true;
      await Promise.all([...launchesInFlight]);
      for (const child of children.values()) {
        if (!isLive(child) || child.stopSignalsSent !== null) continue;
        child.endReasonOverride = 'paused';
        stopChild(child, 0);
      }
      await Promise.all([...children.values()].flatMap((child) => [child.ended, child.stopSignalsSent ?? Promise.resolve()]));
    },
  });
}
