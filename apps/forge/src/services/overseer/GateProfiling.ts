/**
 * The Overseer's gate profiles: each run User queued is one gate in one phase, run once in a fresh detached worktree of main, under its
 * confinement and with no `writes` granted, holding a gate run slot that no waiting real gate wants. The process runs outside the hold;
 * the hold is taken only to record `running` and the end. Its output is appended to its own file as it arrives, which the profile stream
 * follows. A Stop ends the process tree through the port. At an Overseer's start, a run an earlier Overseer left running reads `stopped`
 * and every profile worktree goes.
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync
}                 from 'node:fs';
import { join } from 'node:path';

import { GitProcess }                                                                     from '../../lib/git/GitProcess.ts';
import { GitWorktrees, REAL_WORKTREE_REMOVAL_PRIMITIVES, type WorktreeRemovalPrimitives } from '../../lib/git/GitWorktrees.ts';
import type { PlatformPorts }                                                             from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                                           from '../../lib/process-identity/ProcessIdentity.ts';
import type { GateProfileRun, GateProfileRunEnd, GateProfileRunEnding }                   from '../../lib/tracker-model/@types/GateProfile.ts';
import type { GateOutcome }                                                               from '../../lib/tracker-model/@types/Job.ts';
import type { ResearchFindingRecording }                                                  from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                                                     from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }                                                                   from '../../lib/tracker-model/BoardRefusal.ts';
import { CachingChecks, type CachingSuggestion, type RecordedGateTime }                   from '../lifecycle/CachingChecks.ts';
import { type GateLineRun, type GateLineRefusal, type GateLinesRun }                      from '../lifecycle/GateLineRun.ts';
import type { GateLineConfiner }                                                          from '../lifecycle/GateRun.ts';
import { projectLocationOf }                                                              from '../tracker/ProjectLocation.ts';
import type { Workspace }                                                                 from '../tracker/Workspace.ts';
import { GateRunSlots }                                                                   from './GateRunSlots.ts';

/** The profile worktrees' folder under the worktrees root, one `<profileRunId>` worktree each; the Overseer owns it. */
export const GATE_PROFILE_WORKTREES_FOLDER = 'gate-profiles';

/** The profiles' output under the data folder, one `<profileRunId>.ndjson` each, appended outside the hold. */
export const GATE_PROFILE_RUNS_FOLDER = 'gate-profile-runs';

/** One appended piece of a run's output, numbered from 1 in the order it was appended: the number is a stream client's cursor. */
export interface GateProfileOutputLine {
  lineNumber: number;
  text:       string;
}

/** A run's output after a cursor, re-read from where the last call stopped on each call. */
export type GateProfileOutputFollower = () => GateProfileOutputLine[];

const LINE_FEED_BYTE = 0x0a;

const OUTCOME_ENDINGS: Readonly<Record<GateOutcome, GateProfileRunEnding>> = {
  'passed':     'passed',
  'failed':     'red',
  'cannot-run': 'cannot-run',
};

export interface GateProfileHold {
  board: Board;
  at:    string;
}

export interface GateProfilingContext {
  workspace:          Workspace;
  worktreesRoot:      string;
  mainLine:           string;
  platformPorts:      Pick<PlatformPorts, 'shellLine' | 'processSupervision'>;
  gateSlots:          Pick<ReturnType<typeof GateRunSlots.createGateRunSlots>, 'tryAcquireAfterRealGates' | 'release'>;
  gateEnvironment:    () => Readonly<Record<string, string>>;
  /** Confines each line of the run in the profile's worktree, as a gate of the Overseer's is confined. */
  confinedLineIn:     (worktreePath: string, profileRunId: string) => GateLineConfiner;
  hold:               <Result>(mutate: (hold: GateProfileHold) => Result) => Promise<Result>;
  /** A clock exception: a profile's duration is only recorded and shown. */
  millisecondsNow:    () => number;
  /** Asks for a pass, so the next queued run may take the freed slot. */
  wake:               () => void;
  log:                (line: string) => void;
  runGateLines:       typeof GateLineRun.runOnce;
  removalPrimitives?: WorktreeRemovalPrimitives;
}

export interface GateProfiling {
  /** After a pass: ends the process tree of each run User asked to stop, and starts the queued runs a free slot allows, in queue order. */
  followRuns:    (board: Board) => void;
  /** Before the first pass: a run left running reads `stopped`, and every profile worktree is removed. */
  settleAtStart: () => Promise<void>;
  /** The Overseer stops: each run's process tree is ended, and each run's end is recorded. */
  stopAll:       () => Promise<void>;
  /** Resolves once no run of this Overseer is going. */
  idle:          () => Promise<void>;
}

interface RunInThisProcess {
  promise:  Promise<void>;
  /** The line now running, `null` between lines. */
  process:  ProcessIdentity | null;
  stopping: boolean;
}

/** One finding of topic `note` per caching suggestion: the kind is its label, and it names values, never words. */
function cachingFindingOf(suggestion: CachingSuggestion): ResearchFindingRecording {
  const note = { topic: 'note', label: suggestion.kind, script: null } as const;
  switch (suggestion.kind) {
    case 'no-caching-tool':
      return { ...note, value: suggestion.slowGates.map((gate) => gate.name).join(', '), sourcePaths: [] };
    case 'per-worktree-cache':
      return { ...note, value: suggestion.cacheFolder, sourcePaths: [] };
    case 'task-inputs-unseen':
      return { ...note, value: suggestion.task, sourcePaths: [...suggestion.folders] };
    case 'gate-not-through-turbo':
      return { ...note, value: suggestion.gate, sourcePaths: [] };
  }
}

function sameFinding(recording: ResearchFindingRecording, other: ResearchFindingRecording): boolean {
  return recording.topic === other.topic && recording.label === other.label && recording.value === other.value
    && JSON.stringify(recording.sourcePaths) === JSON.stringify(other.sourcePaths);
}

/**
 * The caching checks over every time the profiles of the run's setup recorded so far, each new suggestion a finding of the record. A
 * record that takes no move now, such as one whose Apply waits, gets none: the profile's end is recorded all the same.
 */
function recordCachingFindings(board: Board, repositoryRoot: string, run: Readonly<GateProfileRun>, at: string): void {
  const setup = board.pipelineSetup();
  if (setup === null || run.setupId !== setup.setupId) return;
  const recordedTimes: RecordedGateTime[] = board.gateProfileRuns()
    .filter((profiled) => profiled.setupId === setup.setupId && profiled.elapsedMilliseconds !== null)
    .map((profiled) => ({ name: profiled.gate.name, milliseconds: profiled.elapsedMilliseconds ?? 0 }));
  const gates = setup.draft?.gates ?? [];
  for (const suggestion of CachingChecks.cachingSuggestionsOf(repositoryRoot, gates, recordedTimes)) {
    const recording = cachingFindingOf(suggestion);
    const recorded = board.pipelineSetup()?.findings ?? [];
    if (recorded.some((finding) => sameFinding(recording, finding))) continue;
    try {
      board.recordFinding(setup.setupId, recording, at);
    } catch (refusal) {
      if (refusal instanceof BoardRefusal) return;
      throw refusal;
    }
  }
}

function endingOf(run: GateLinesRun | GateLineRefusal): GateProfileRunEnd {
  const cannotRun: GateProfileRunEnd = { ending: 'cannot-run', elapsedMilliseconds: 0, cacheReport: null };
  if ('verdict' in run) return cannotRun;
  const [gate] = run.gates;
  if (gate === undefined) return cannotRun;
  // The log stores a whole number of milliseconds, and a clock may answer a fraction.
  return { ending: OUTCOME_ENDINGS[gate.outcome], elapsedMilliseconds: Math.round(gate.milliseconds), cacheReport: gate.cacheReport };
}

function createGateProfiling(context: GateProfilingContext): GateProfiling {
  const runsInThisProcess = new Map<string, RunInThisProcess>();
  const { workspace, worktreesRoot, platformPorts } = context;
  const worktreesFolder = join(worktreesRoot, GATE_PROFILE_WORKTREES_FOLDER);
  const outputFolder = join(workspace.trackerDirectory, GATE_PROFILE_RUNS_FOLDER);
  const removalPrimitives = context.removalPrimitives ?? REAL_WORKTREE_REMOVAL_PRIMITIVES;
  // Git runs at the repository's root, and the lines in the project's folder of each checkout.
  const { repositoryRoot, projectPrefix } = projectLocationOf(workspace.rootDirectory);

  function removeWorktree(worktreePath: string): void {
    const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: repositoryRoot, worktreePath, force: 'force' }, removalPrimitives);
    if (removal.verdict === 'left') context.log(`The gate profile worktree ${worktreePath} is a leftover: ${removal.reason}`);
  }

  function appendOutput(profileRunId: string, text: string): void {
    appendFileSync(join(outputFolder, `${profileRunId}.ndjson`), `${JSON.stringify({ text })}\n`);
  }

  function stopProcessTree(running: RunInThisProcess): void {
    running.stopping = true;
    if (running.process === null) return;
    const { processSupervision } = platformPorts;
    const members = processSupervision.treeMembersOf(running.process) ?? undefined;
    const stop = processSupervision.stopTree(running.process, 'force', members);
    if (stop.verdict === 'refused') context.log(`The stop of a gate profile was refused: ${stop.reason}`);
  }

  /** Never throws: a failure is logged and the run waits for the next start's sweep. */
  async function runProfile(run: Readonly<GateProfileRun>, holder: string, running: RunInThisProcess): Promise<void> {
    const worktreePath = join(worktreesFolder, run.profileRunId);
    try {
      const marked = await context.hold(({ board }) => board.markGateProfileRunning(run.profileRunId));
      if (marked.changed === false) return;
      mkdirSync(worktreesFolder, { recursive: true });
      mkdirSync(outputFolder, { recursive: true });
      const added = GitProcess.run(repositoryRoot, ['worktree', 'add', '--quiet', '--detach', worktreePath, context.mainLine]);
      const lines = GitProcess.succeeded(added)
        ? await context.runGateLines({
          shellLine:       platformPorts.shellLine,
          environment:     context.gateEnvironment(),
          spawnOptions:    platformPorts.processSupervision.spawnOptionsFor('gate'),
          confinedLineOf:  context.confinedLineIn(worktreePath, run.profileRunId),
          prepare:         run.prepare,
          gates:           [{ ...run.gate }],
          directory:       worktreePath,
          projectPrefix,
          millisecondsNow: context.millisecondsNow,
          grantsWrites:    false,
          onSpawned:       (processId) => {
            running.process = platformPorts.processSupervision.identityOf(processId);
            if (running.stopping) stopProcessTree(running);
          },
          onOutput: (text) => appendOutput(run.profileRunId, text),
        })
        : { verdict: 'sandbox-unavailable', reason: GitProcess.failureReasonOf(added, ['worktree', 'add']) } as const;
      running.process = null;
      if ('verdict' in lines) appendOutput(run.profileRunId, lines.reason);
      const end = endingOf(lines);
      await context.hold(({ board, at }) => {
        // A run this Overseer ended as it stopped has no result, as one User stopped has none.
        if (running.stopping) board.stopGateProfile(run.profileRunId, at);
        const ended = board.endGateProfile(run.profileRunId, end, at);
        if (ended.run.state !== 'stopped') recordCachingFindings(board, repositoryRoot, ended.run, at);
      });
    } catch (failure) {
      context.log(`Gate profile ${run.profileRunId} failed and waits for the next start: ${failure instanceof Error ? failure.message : String(failure)}`);
    } finally {
      context.gateSlots.release(holder);
      if (existsSync(worktreePath)) removeWorktree(worktreePath);
      runsInThisProcess.delete(run.profileRunId);
      context.wake();
    }
  }

  function followRuns(board: Board): void {
    const runs = board.gateProfileRuns();
    for (const run of runs) {
      const running = runsInThisProcess.get(run.profileRunId);
      if (running !== undefined && run.stopRequested && !running.stopping) stopProcessTree(running);
    }
    for (const run of runs) {
      if (run.state !== 'queued' || runsInThisProcess.has(run.profileRunId)) continue;
      const holder = GateRunSlots.inProcessHolderOf(`gate-profile:${run.profileRunId}`);
      if (!context.gateSlots.tryAcquireAfterRealGates(holder)) return;
      const running: RunInThisProcess = { promise: Promise.resolve(), process: null, stopping: false };
      runsInThisProcess.set(run.profileRunId, running);
      running.promise = runProfile(run, holder, running);
    }
  }

  async function settleAtStart(): Promise<void> {
    await context.hold(({ board, at }) => board.stopGateProfilesLeftRunning(at));
    if (!existsSync(worktreesFolder)) return;
    for (const name of readdirSync(worktreesFolder)) removeWorktree(join(worktreesFolder, name));
  }

  async function stopAll(): Promise<void> {
    for (const running of runsInThisProcess.values()) stopProcessTree(running);
    await idle();
  }

  async function idle(): Promise<void> {
    await Promise.all([...runsInThisProcess.values()].map((running) => running.promise));
  }

  return {
    followRuns, settleAtStart, stopAll, idle
  };
}

function outputTextOf(lineText: string): string | null {
  try {
    const parsed: unknown = JSON.parse(lineText);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { text } = parsed as { text?: unknown };
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

/** The bytes of the file from `offset` to its end; none when the file does not exist yet. */
function bytesFrom(filePath: string, offset: number): Uint8Array {
  if (!existsSync(filePath)) return new Uint8Array();
  const descriptor = openSync(filePath, 'r');
  try {
    const length = Math.max(fstatSync(descriptor).size - offset, 0);
    const bytes = new Uint8Array(length);
    const read = readSync(descriptor, bytes, 0, length, offset);
    return bytes.subarray(0, read);
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Follows `<data>/gate-profile-runs/<P>.ndjson` after line `afterLineNumber`. Each call reads only the bytes appended since the last one;
 * an unterminated last line waits for its line feed, and a line that is no `{"text": …}` keeps its number and is not sent.
 */
function outputFollowerOf(trackerDirectory: string, profileRunId: string, afterLineNumber: number): GateProfileOutputFollower {
  const outputFilePath = join(trackerDirectory, GATE_PROFILE_RUNS_FOLDER, `${profileRunId}.ndjson`);
  const decoder = new TextDecoder();
  let consumedBytes = 0;
  let lineNumber = 0;
  return () => {
    const bytes = bytesFrom(outputFilePath, consumedBytes);
    const lines: GateProfileOutputLine[] = [];
    let lineStart = 0;
    for (let lineEnd = bytes.indexOf(LINE_FEED_BYTE); lineEnd !== -1; lineEnd = bytes.indexOf(LINE_FEED_BYTE, lineStart)) {
      lineNumber += 1;
      const text = outputTextOf(decoder.decode(bytes.subarray(lineStart, lineEnd)));
      if (text !== null && lineNumber > afterLineNumber) lines.push({ lineNumber, text });
      lineStart = lineEnd + 1;
    }
    consumedBytes += lineStart;
    return lines;
  };
}

export const GateProfiling = Object.freeze({ createGateProfiling, outputFollowerOf });
