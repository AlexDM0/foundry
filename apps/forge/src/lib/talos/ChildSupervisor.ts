/**
 * The children of one Talos: each launched child runs under the port's spawn, its stdout lines go to its event log, its stderr to its log,
 * and its record follows it from `starting` to `ended`. An agent takes input, has its requests answered by its standing replies and its
 * named endings recognised; what Talos does to its input or process goes to its event log first. A stop lists the tree first and signals
 * it through the synchronous-calls thread; a line past its time bound is stopped, the gaps in Talos's ticks added to its allowance and left
 * out of its run time. The clean quit's parts work over every child at once.
 */
import type { ProcessIdentity }                     from '../process-identity/ProcessIdentity.ts';
import type { ProcessStopStage, ProcessTreeMember } from '../process-identity/ProcessSupervision.ts';
import type {
  AppliedInput,
  ChildInput,
  ClientEntry,
  FrameRefusalReason,
  StateFrame
} from './@types/TalosFrame.ts';
import { childIdOf, childLaunchOf, type ChildLaunch } from './ChildLaunch.ts';
import {
  type ChildEnd,
  type ChildRecord,
  childRecordTextOf,
  type ChildState
} from './ChildRecord.ts';
import { createEndingRecognition, type EndingRecognition, type RecognisedEnding }                         from './EndingPatterns.ts';
import type { EventOrigin }                                                                               from './EventLog.ts';
import type { LaunchRegistry }                                                                            from './LaunchRegistry.ts';
import { parsedLineOf }                                                                                   from './LineConditions.ts';
import { standingReplyForParsedLine }                                                                     from './StandingReplies.ts';
import { forEachLine }                                                                                    from './StreamLines.ts';
import { gapLengthOf }                                                                                    from './SupervisionLease.ts';
import type { SynchronousCalls }                                                                          from './SynchronousCallsClient.ts';
import { type ChildFiles, childFilesOf }                                                                  from './TalosFiles.ts';
import { clientEntryLineOf, quitActInputOf }                                                              from './TalosFrames.ts';
import { CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS, CHILD_RECORD_FORMAT_VERSION, EVENT_LOG_FORMAT_VERSION } from './constants/TalosProtocol.ts';
import { TalosLogWordingUtil }                                                                            from './utils/TalosLogWordingUtil.ts';

const TREE_SWEEP_INTERVAL_MILLISECONDS = 100;
const TREE_SWEEP_ATTEMPTS              = 20;

export interface ChildSpawnRequest {
  readonly argv:              readonly string[];
  readonly workingDirectory:  string;
  readonly environment:       Readonly<Record<string, string>>;
  readonly verbatimArguments: boolean;
  /** An agent's stdin is piped; a line's is closed. */
  readonly takesInput:        boolean;
}

/** A child's piped stdin; either call may throw once the child closed it or ended. */
export interface ChildStandardInput {
  readonly writeLine: (line: string) => void;
  readonly close:     () => void;
}

/** A child as the spawn port gives it: its stdin piped when it takes input and closed otherwise, its stdout and stderr piped. */
export interface SpawnedChild {
  readonly processId:      number;
  readonly standardInput:  ChildStandardInput | null;
  readonly standardOutput: ReadableStream<Uint8Array>;
  readonly standardError:  ReadableStream<Uint8Array> | null;
  readonly exited:         Promise<number | null>;
  /** Asked once `exited` settled. */
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

/** Why Talos asked an agent to quit at the end of its turn: a clean quit, or a supervision lease nobody renewed. */
export type AgentQuitReason = 'paused' | 'lease-ended';

/** The agents one quit act went to, and only those: an agent launched while their wait runs is none of theirs. */
export interface AgentsAskedToQuit {
  /** Stops each of them still live and unstopped at once; it ends for the reason its quit act noted. */
  readonly stopLive:     () => void;
  /** Settles once each of their ends is recorded and its stop sent its last signal. */
  readonly endsRecorded: () => Promise<void>;
}

/** The children as the clean quit works over them; every part leaves alone a child whose stop was already asked for. */
export interface QuittingChildren {
  /** Refuses every later launch with `quitting` and settles once the launches in flight answered. */
  readonly refuseLaunches:          () => Promise<void>;
  /** Stops every live line at once; each ends `paused`. */
  readonly pauseLiveLines:          () => void;
  /** Applies each live agent's quit act once, the act first in its event log, and notes the reason it ends for. */
  readonly quitLiveAgentsAtTurnEnd: (reason: AgentQuitReason) => AgentsAskedToQuit;
  /** Settles once every child's end is recorded and its stop sent its last signal. */
  readonly everyEndRecorded:        () => Promise<void>;
}

export interface ChildSupervisor extends QuittingChildren {
  /** Answers once the child runs, or once it ended without running. */
  readonly launch:    (launchValue: unknown) => Promise<ChildFrameVerdict>;
  readonly stop:      (childId: string, graceMilliseconds: number) => ChildFrameVerdict;
  /** Answers once the input is in the agent's event log and applied. */
  readonly input:     (childId: string, input: ChildInput) => Promise<ChildFrameVerdict>;
  readonly stopLines: () => ChildFrameVerdict;
  readonly ticked:    (wallNowMilliseconds: number) => void;
}

type EndReasonOverride = 'time-bound' | AgentQuitReason;

interface SupervisedChild {
  readonly childId:                string;
  readonly launch:                 ChildLaunch;
  readonly files:                  ChildFiles;
  /** `null` for a line, which nothing reads for an ending. */
  readonly recognition:            EndingRecognition | null;
  record:                          ChildRecord;
  standardInput:                   ChildStandardInput | null;
  quitActApplied:                  boolean;
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
  let launchesRefused = false;
  let markQuittingBegun = (): void => undefined;
  const quittingBegun = new Promise<void>((resolve) => {
    markQuittingBegun = resolve;
  });

  const isLive = (child: SupervisedChild): boolean => child.record.state !== 'ended' && !child.exited;
  const isAgent = (child: SupervisedChild): boolean => child.launch.kind === 'agent';

  function logLine(text: string): void {
    void calls.appendText(context.talosLogPath, `${text}\n`);
  }

  function broadcastStateOf(child: SupervisedChild, recognisedEnding: RecognisedEnding | null): void {
    const { state, end } = child.record;
    context.broadcastState({
      kind: 'state', childId: child.childId, state, end, recognisedEnding
    });
  }

  /** Written first, then broadcast, so a client that hears of a state reads it in the record. */
  async function changeRecord(child: SupervisedChild, changes: Partial<ChildRecord>): Promise<void> {
    child.record = { ...child.record, ...changes };
    await calls.writeRecord(child.files.recordPath, childRecordTextOf(child.record), false);
    broadcastStateOf(child, null);
  }

  /** The sequence is taken at once, so the queue to the thread keeps the log in the order the main thread saw. */
  function appendEvent(child: SupervisedChild, origin: EventOrigin, line: string): Promise<unknown> {
    child.lastSequence += 1;
    return calls.appendEvent(child.files.eventLogPath, {
      sequence: child.lastSequence, origin, line, at: context.stampNow()
    });
  }

  function appendClientEntry(child: SupervisedChild, entry: ClientEntry): Promise<unknown> {
    return appendEvent(child, 'client', clientEntryLineOf(entry));
  }

  /** A child that closed its stdin or ended answers through its exit, never through this. */
  function actOnStandardInput(child: SupervisedChild, act: (standardInput: ChildStandardInput) => void): void {
    if (child.standardInput === null) return;
    try {
      act(child.standardInput);
    } catch {
      // The input is already closed, by an earlier act or by the child's end.
    }
  }

  function applyInput(child: SupervisedChild, input: AppliedInput): void {
    if (input.act === 'write-line') actOnStandardInput(child, (standardInput) => standardInput.writeLine(input.line));
    else actOnStandardInput(child, (standardInput) => standardInput.close());
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
    logLine(`stop ${stage} ${child.childId}: ${outcome.verdict}${outcome.verdict === 'refused' ? ` (${TalosLogWordingUtil.processStopRefusalOf(outcome.refusal)})` : ''}`);
  }

  /** `force` again until the listing is empty, since a member still being killed can have started another; the attempts end it regardless. */
  async function sweepTree(child: SupervisedChild): Promise<void> {
    for (let attempt = 1; attempt <= TREE_SWEEP_ATTEMPTS; attempt += 1) {
      await stopTree(child, 'force');
      await Bun.sleep(TREE_SWEEP_INTERVAL_MILLISECONDS);
      if ((await listTree(child)).length === 0) return;
    }
  }

  /** The grace of a tree stop at an agent's end, over at once when a quit begins: a quit is bounded by its own wait and the sweep alone. */
  function treeStopAtEndGraceElapsed(graceMilliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, graceMilliseconds);
      void quittingBegun.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * The tree is listed first, because the walk through parent ids finds nothing once the child died, and an agent's stdin is closed next;
   * `ask` and `force` follow, each after the grace. An agent's stop is in its event log before any of it.
   */
  function stopChild(
    child: SupervisedChild,
    graceMilliseconds: number,
    graceElapsed: (milliseconds: number) => Promise<unknown> = (milliseconds) => Bun.sleep(milliseconds),
  ): void {
    if (child.stopSignalsSent !== null) return;
    const entryAppended = isAgent(child) && isLive(child) ? appendClientEntry(child, { act: 'stop', graceMilliseconds }) : Promise.resolve();
    if (isLive(child)) void changeRecord(child, { state: 'stopping' });
    child.stopSignalsSent = (async (): Promise<void> => {
      await entryAppended;
      await child.running;
      await listTree(child);
      actOnStandardInput(child, (standardInput) => standardInput.close());
      await graceElapsed(graceMilliseconds);
      await stopTree(child, 'ask');
      await graceElapsed(graceMilliseconds);
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

  /**
   * An agent's line is parsed once: its standing reply, if one answers it, follows the line in the log and goes to the child. A recognised
   * ending is queued to the record before the line to the log, so a reader that finds the line in the log finds the ending in the record
   * read after it; the state frame that names it goes once both are written.
   */
  function consumeAgentLine(child: SupervisedChild, line: string): void {
    const parsed = parsedLineOf(line);
    const recognisedEnding = child.recognition?.observe(parsed, child.lastSequence + 1) ?? null;
    if (recognisedEnding === null) {
      void appendEvent(child, 'agent', line);
    } else {
      child.record = { ...child.record, recognisedEndings: [...child.record.recognisedEndings, recognisedEnding] };
      const recordWritten = calls.writeRecord(child.files.recordPath, childRecordTextOf(child.record), false);
      const lineAppended = appendEvent(child, 'agent', line);
      void Promise.all([recordWritten, lineAppended]).then(() => broadcastStateOf(child, recognisedEnding));
    }
    const reply = standingReplyForParsedLine(parsed, child.launch.standingReplies);
    if (reply === null) return;
    void appendEvent(child, 'talos', reply);
    actOnStandardInput(child, (standardInput) => standardInput.writeLine(reply));
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
    await forEachLine(spawned.standardOutput, (line) => (isAgent(child) ? consumeAgentLine(child, line) : void appendEvent(child, 'agent', line)));
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
    // An agent that ended with no stop asked for can leave a group of its own running below it. One that ended on its quit act is swept at
    // once, since a quit or a lease's end waits for that sweep.
    const treeStopGrace = child.launch.treeStopAtEndGraceMilliseconds;
    if (isAgent(child) && child.stopSignalsSent === null && treeStopGrace !== null) {
      stopChild(child, child.quitActApplied ? 0 : treeStopGrace, treeStopAtEndGraceElapsed);
    }
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
      recognition:                     launch.kind === 'agent' ? createEndingRecognition(launch.closingLine, launch.endingPatterns) : null,
      record:                          startedRecordOf(launch, childId),
      standardInput:                   null,
      quitActApplied:                  false,
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
        takesInput:        launch.kind === 'agent',
      });
    } catch (error) {
      children.set(childId, child);
      child.exited = true;
      await endChild(child, {
        reason: 'spawn-failed', exitCode: null, signal: null, detail: String(error), runMilliseconds: 0
      });
      return { verdict: 'done' };
    }
    child.standardInput = spawned.standardInput;
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
    if (launchesRefused) return { verdict: 'refused', reason: 'quitting' };
    const reading = childLaunchOf(launchValue, context.boardFolder);
    if (reading.verdict === 'refused') return { verdict: 'refused', reason: reading.reason };
    const { launch } = reading;
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

  async function input(childId: string, childInput: ChildInput): Promise<ChildFrameVerdict> {
    const child = children.get(childId);
    if (child === undefined) return { verdict: 'refused', reason: 'unknown-child' };
    if (!isAgent(child)) return { verdict: 'refused', reason: 'kind-takes-no-input' };
    if (!isLive(child)) return { verdict: 'refused', reason: 'child-ended' };
    const appliedInput = childInput.act === 'quit-at-turn-end' ? quitActInputOf(child.launch.quitAtTurnEnd) : childInput;
    if (appliedInput === null) return { verdict: 'refused', reason: 'no-quit-act' };
    await appendClientEntry(child, appliedInput);
    applyInput(child, appliedInput);
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

  /** Live children of a kind whose stop nobody asked for: the ones a part of the clean quit acts on. */
  function unstoppedLiveChildrenOf(kind: ChildLaunch['kind']): readonly SupervisedChild[] {
    return [...children.values()].filter((child) => child.launch.kind === kind && isLive(child) && child.stopSignalsSent === null);
  }

  function quitAtTurnEnd(child: SupervisedChild, reason: AgentQuitReason): void {
    if (child.quitActApplied) return;
    child.quitActApplied = true;
    child.endReasonOverride ??= reason;
    const input = quitActInputOf(child.launch.quitAtTurnEnd);
    // An agent with no quit act runs on until the wait ends and it is stopped.
    if (input === null) return;
    void appendClientEntry(child, input).then(() => applyInput(child, input));
  }

  function endsRecordedOf(supervisedChildren: readonly SupervisedChild[]): Promise<void> {
    return Promise.all(supervisedChildren.map(async (child) => {
      await child.ended;
      await child.stopSignalsSent;
    })).then(() => undefined);
  }

  return Object.freeze({
    launch: (launchValue: unknown) => {
      const launching = launchOf(launchValue);
      launchesInFlight.add(launching);
      void launching.finally(() => launchesInFlight.delete(launching));
      return launching;
    },
    stop,
    input,
    stopLines: (): ChildFrameVerdict => {
      for (const child of children.values()) if (child.launch.kind === 'line' && isLive(child)) stopChild(child, 0);
      return { verdict: 'done' };
    },
    ticked,
    refuseLaunches: async () => {
      launchesRefused = true;
      markQuittingBegun();
      await Promise.all([...launchesInFlight]);
    },
    pauseLiveLines: () => {
      for (const child of unstoppedLiveChildrenOf('line')) {
        child.endReasonOverride = 'paused';
        stopChild(child, 0);
      }
    },
    quitLiveAgentsAtTurnEnd: (reason: AgentQuitReason): AgentsAskedToQuit => {
      const agentsAskedToQuit = unstoppedLiveChildrenOf('agent');
      for (const child of agentsAskedToQuit) quitAtTurnEnd(child, reason);
      return Object.freeze({
        stopLive: () => {
          for (const child of agentsAskedToQuit) if (isLive(child) && child.stopSignalsSent === null) stopChild(child, 0);
        },
        endsRecorded: () => endsRecordedOf(agentsAskedToQuit),
      });
    },
    everyEndRecorded: () => endsRecordedOf([...children.values()]),
  });
}
