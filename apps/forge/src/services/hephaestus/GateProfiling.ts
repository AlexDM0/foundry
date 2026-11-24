/**
 * Hephaestus's gate profiles: each run User queued is one gate in one phase, run once in a fresh detached worktree of main, under its
 * confinement and with no `writes` granted, holding a gate run slot that no waiting real gate wants. Its lines run under Talos in the run's
 * folder `gate-profile-runs/<P>`, outside the hold; the hold is taken only to record `running` and the end. An entity's gate runs with its
 * folders from the repository's root, as the press resolved them. Its output is appended to its own file as Talos records it, which the
 * profile stream follows. A Stop sends `stop` to its running line. At a Hephaestus's start, the lines an earlier Hephaestus left are stopped,
 * then a run it left running reads `stopped` and every profile worktree goes.
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
import type { GateProfileRun, GateProfileRunEnd, GateProfileRunEnding }                   from '../../lib/tracker-model/@types/GateProfile.ts';
import type { GateOutcome, PipelineStepRun }                                              from '../../lib/tracker-model/@types/Job.ts';
import type { EntityKey, Pipeline, PipelineGate }                                         from '../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup, ResearchFinding, ResearchFindingRecording }                  from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                                                     from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }                                                                   from '../../lib/tracker-model/BoardRefusal.ts';
import { PipelineUtil }                                                                   from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { CachingChecks, type CachingSuggestion, type RecordedGateTime }                   from '../lifecycle/CachingChecks.ts';
import { type GateLineRun, type GateLineRefusal, type GateLinesRun }                      from '../lifecycle/GateLineRun.ts';
import type { GateLineConfiner, LineRunner }                                              from '../lifecycle/GateRun.ts';
import { projectLocationOf }                                                              from '../tracker/ProjectLocation.ts';
import type { Workspace }                                                                 from '../tracker/Workspace.ts';
import type { GateRunSlots }                                                              from './GateRunSlots.ts';

/** The profile worktrees' folder under the worktrees root, one `<profileRunId>` worktree each; Hephaestus owns it. */
export const GATE_PROFILE_WORKTREES_FOLDER = 'gate-profiles';

/** The profiles' output under the data folder, one `<profileRunId>.ndjson` each appended outside the hold, beside each run's folder of lines. */
export const GATE_PROFILE_RUNS_FOLDER = 'gate-profile-runs';

/** One appended piece of a run's output, numbered from 1 in the order it was appended: the number is a stream client's cursor. */
export interface GateProfileOutputLine {
  lineNumber: number;
  text:       string;
}

/** A run's output after a cursor, re-read from where the last call stopped on each call. */
export type GateProfileOutputFollower = () => GateProfileOutputLine[];

const LINE_FEED_BYTE = 0x0a;

const OUTCOME_ENDINGS: Readonly<Record<GateOutcome, Exclude<GateProfileRunEnding, 'timed-out'>>> = {
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
  platformPorts:      Pick<PlatformPorts, 'shellLine'>;
  gateSlots:          Pick<GateRunSlots, 'tryAcquireAfterRealGates' | 'release'>;
  /** The environment a profile's lines run in, whose search path holds the tools its steps run. */
  gateEnvironment:    (profiledSteps: Pick<GateProfileRun, 'prepare'> & { gates: GateProfileRun['gate'][] }) => Readonly<Record<string, string>>;
  /** Confines each line of the run in the profile's worktree, as a gate of Hephaestus's is confined. */
  confinedLineIn:     (worktreePath: string, profileRunId: string) => GateLineConfiner;
  hold:               <Result>(mutate: (hold: GateProfileHold) => Result) => Promise<Result>;
  /** Asks for a pass, so the next queued run may take the freed slot. */
  wake:               () => void;
  log:                (line: string) => void;
  runGateLines:       typeof GateLineRun.runOnce;
  runLine:            LineRunner;
  /** Sends `stop` to every live line under the folder and waits, bounded, for their ends. */
  stopLiveLinesUnder: (folder: string) => Promise<void>;
  removalPrimitives?: WorktreeRemovalPrimitives;
}

export interface GateProfiling {
  /** After a pass: stops the line of each run User asked to stop, and starts the queued runs a free slot allows, in queue order. */
  followRuns:    (board: Board) => void;
  /** Before the first pass: the lines left running are stopped, a run left running reads `stopped`, and every profile worktree is removed. */
  settleAtStart: () => Promise<void>;
  /** Hephaestus stops: each run's line is stopped, and each run's end is recorded. */
  stopAll:       () => Promise<void>;
  /** Resolves once no run of this Hephaestus is going. */
  idle:          () => Promise<void>;
}

interface RunInThisProcess {
  promise:        Promise<void>;
  /** Aborted at a stop: the line running then is stopped, and no further line launches. */
  stopController: AbortController;
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

/** The draft's gates, or the gates of the run's entity, read through its single pipeline. */
function draftGatesOf(draft: Readonly<Pipeline> | null, run: Readonly<GateProfileRun>): readonly PipelineGate[] {
  if (draft === null) return [];
  if (run.entity === undefined) return draft.gates;
  return PipelineUtil.pipelineOfEntity(draft, run.entity)?.gates ?? [];
}

/** The findings of the forge's part of the record, or of the entity's part. */
function recordedFindingsOf(setup: Readonly<PipelineSetup> | null, entityKey: EntityKey | undefined): readonly ResearchFinding[] {
  if (setup === null) return [];
  if (entityKey === undefined) return setup.findings;
  const entities = setup.entities ?? {};
  return Object.hasOwn(entities, entityKey) ? entities[entityKey]?.findings ?? [] : [];
}

/**
 * The caching checks over every time the profiles of the run's setup, and of its entity, recorded so far, each new suggestion a finding of
 * the record, in the entity's part for an entity's run. A record that takes no move now, such as one whose Apply waits, gets none: the
 * profile's end is recorded all the same.
 */
function recordCachingFindings(board: Board, repositoryRoot: string, run: Readonly<GateProfileRun>, at: string): void {
  const setup = board.pipelineSetup();
  if (setup === null || run.setupId !== setup.setupId) return;
  const recordedTimes: RecordedGateTime[] = board.gateProfileRuns()
    .filter((profiled) => profiled.setupId === setup.setupId && profiled.entity === run.entity && profiled.elapsedMilliseconds !== null)
    .map((profiled) => ({ name: profiled.gate.name, milliseconds: profiled.elapsedMilliseconds ?? 0 }));
  const gates = draftGatesOf(setup.draft, run);
  for (const suggestion of CachingChecks.cachingSuggestionsOf(repositoryRoot, gates, recordedTimes)) {
    const recording = cachingFindingOf(suggestion);
    const recorded = recordedFindingsOf(board.pipelineSetup(), run.entity);
    if (recorded.some((finding) => sameFinding(recording, finding))) continue;
    try {
      board.recordFinding(setup.setupId, recording, at, run.entity);
    } catch (refusal) {
      if (refusal instanceof BoardRefusal) return;
      throw refusal;
    }
  }
}

/** A gate Talos stopped at its time bound timed out; its time is the line's run time, a sleep not counted. */
function endingOf(run: GateLinesRun | GateLineRefusal): GateProfileRunEnd {
  const cannotRun: GateProfileRunEnd = { ending: 'cannot-run', elapsedMilliseconds: 0, cacheReport: null };
  if ('verdict' in run) return cannotRun;
  const [gate] = run.gates;
  if (gate === undefined) return cannotRun;
  return {
    ending:              gate.stoppedAtTimeBound ? 'timed-out' : OUTCOME_ENDINGS[gate.outcome],
    elapsedMilliseconds: Math.round(gate.milliseconds),
    cacheReport:         gate.cacheReport,
  };
}

/** The profiled gate's line, with its run time, when it ran; a profile's prepare steps are not the pipeline's runs and record none. */
function profiledStepRunsOf(run: GateLinesRun | GateLineRefusal, entity: EntityKey | undefined): PipelineStepRun[] {
  const stepRun = 'verdict' in run ? null : run.gates[0]?.stepRun ?? null;
  if (stepRun === null) return [];
  return [entity === undefined ? stepRun : { ...stepRun, entity }];
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

  function runFolderOf(profileRunId: string): string {
    return join(outputFolder, profileRunId);
  }

  /** Never throws: a failure is logged and the run waits for the next start's sweep. */
  async function runProfile(run: Readonly<GateProfileRun>, holder: string, running: RunInThisProcess): Promise<void> {
    const worktreePath = join(worktreesFolder, run.profileRunId);
    const stopSignal = running.stopController.signal;
    try {
      const marked = await context.hold(({ board }) => board.markGateProfileRunning(run.profileRunId));
      if (marked.changed === false) return;
      mkdirSync(worktreesFolder, { recursive: true });
      mkdirSync(outputFolder, { recursive: true });
      const added = GitProcess.run(repositoryRoot, ['worktree', 'add', '--quiet', '--detach', worktreePath, context.mainLine]);
      const lines = GitProcess.succeeded(added)
        ? await context.runGateLines({
          shellLine:      platformPorts.shellLine,
          environment:    context.gateEnvironment({ prepare: run.prepare, gates: [run.gate] }),
          confinedLineOf: context.confinedLineIn(worktreePath, run.profileRunId),
          runLine:        (lineRequest) => context.runLine({ ...lineRequest, stopSignal }),
          childFolder:    runFolderOf(run.profileRunId),
          prepare:        run.prepare,
          gates:          [{ ...run.gate }],
          directory:      worktreePath,
          projectPrefix,
          grantsWrites:   false,
          onOutputLine:   (line) => appendOutput(run.profileRunId, `${line}\n`),
        })
        : { verdict: 'sandbox-unavailable', reason: GitProcess.failureReasonOf(added, ['worktree', 'add']) } as const;
      if ('verdict' in lines) appendOutput(run.profileRunId, lines.reason);
      const end = endingOf(lines);
      await context.hold(({ board, at }) => {
        // A run this Hephaestus ended as it stopped has no result, as one User stopped has none.
        if (stopSignal.aborted) board.stopGateProfile(run.profileRunId, at);
        const ended = board.endGateProfile(run.profileRunId, end, at);
        if (ended.run.state === 'stopped') return;
        recordCachingFindings(board, repositoryRoot, ended.run, at);
        board.recordPipelineStepsRan(profiledStepRunsOf(lines, run.entity), run.phase, at);
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
      if (running !== undefined && run.stopRequested) running.stopController.abort();
    }
    for (const run of runs) {
      if (run.state !== 'queued' || runsInThisProcess.has(run.profileRunId)) continue;
      mkdirSync(outputFolder, { recursive: true });
      const holder = runFolderOf(run.profileRunId);
      if (!context.gateSlots.tryAcquireAfterRealGates(holder)) return;
      const running: RunInThisProcess = { promise: Promise.resolve(), stopController: new AbortController() };
      runsInThisProcess.set(run.profileRunId, running);
      running.promise = runProfile(run, holder, running);
    }
  }

  async function settleAtStart(): Promise<void> {
    await context.stopLiveLinesUnder(outputFolder);
    await context.hold(({ board, at }) => board.stopGateProfilesLeftRunning(at));
    if (!existsSync(worktreesFolder)) return;
    for (const name of readdirSync(worktreesFolder)) removeWorktree(join(worktreesFolder, name));
  }

  async function stopAll(): Promise<void> {
    for (const running of runsInThisProcess.values()) running.stopController.abort();
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
