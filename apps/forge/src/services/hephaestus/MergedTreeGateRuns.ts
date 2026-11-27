/**
 * The merged-tree gate runs beside the drive pass (design section 3.2, "Renewal that only progress earns"): a pass asks for a gate, the run
 * starts and the pass carries on, and a later pass settles the Airlock from the outcome the run kept in its folder under the board folder.
 * The folder is keyed by everything the outcome rests on, so an ask while a run is in flight starts no second run. The run's lines are line
 * children of Talos in that folder: a stop sends `stop` to them, and the next Hephaestus stops the ones an earlier Hephaestus left running.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync
} from 'node:fs';
import { basename, join } from 'node:path';

import type { MergedTreeGate }                                               from '../../adapters/gate-outcome/@types/MergedTreeGate.ts';
import { MergedTreeGateOutcomeIngestion, type MergedTreeGateOutcomeReading } from '../../adapters/gate-outcome/MergedTreeGateOutcomeIngestion.ts';
import { MergedTreeGateOutcomeProblemWording }                               from '../../adapters/gate-outcome/MergedTreeGateOutcomeProblemWording.ts';
import { createMergedTreeGateOutcomeWriter }                                 from '../../adapters/gate-outcome/MergedTreeGateOutcomeWriter.ts';
import type { GatePhase, GateRunStamp }                                      from '../../lib/tracker-model/@types/GatePhase.ts';
import type { EntityKey }                                                    from '../../lib/tracker-model/@types/Pipeline.ts';
import { LinePausedError }                                                   from '../lifecycle/GateRun.ts';

export const MERGED_TREE_GATE_RUNS_FOLDER = 'merge-gates';
export const MERGED_TREE_GATE_OUTCOME_FILE = 'outcome.json';

const RUN_FOLDER_NAME_CHARACTERS = 16;
const SHORT_TREE_CHARACTERS = 12;

export interface MergedTreeGateRunRequest {
  worktreePath:  string;
  treeId:        string;
  phase:         GatePhase;
  gatedEntities: readonly EntityKey[] | undefined;
  /** The gate-run stamp of the pipeline read for this ask; its hashes key the run folder. `null` when no pipeline is stored. */
  stamp:         GateRunStamp | null;
  /** The merge job whose slot waits on the run; `null` for a stale green's, which no job holds. Not part of the key: a later ask takes it over. */
  ownerJobId:    string | null;
  /**
   * Starts the run with its lines in `runFolder`; called once per run folder. A run that throws keeps no outcome, and so does one whose
   * `stopSignal` was aborted.
   */
  run:           (runFolder: string, stopSignal: AbortSignal) => Promise<MergedTreeGate>;
}

export type MergedTreeGateRunKey = Pick<MergedTreeGateRunRequest, 'worktreePath' | 'treeId' | 'phase' | 'gatedEntities' | 'stamp'>;

export interface MergedTreeGateRuns {
  readonly gateOf:              (request: MergedTreeGateRunRequest) => MergedTreeGate | 'running';
  /** Removes the run folder once its outcome settled the Airlock. */
  readonly settled:             (key: MergedTreeGateRunKey) => void;
  /**
   * Starts no further run, stops the live lines of every run in flight and awaits their ends; a run the stop ended keeps no outcome, so the
   * next start runs it again.
   */
  readonly stopAll:             () => Promise<void>;
  /** Stops the runs in flight in the worktree, whose Airlock freed it, and awaits their ends; each keeps no outcome and loses its folder. */
  readonly stopRunsIn:          (worktreePath: string) => Promise<void>;
  /**
   * Stops, without awaiting their ends, the runs whose owner job has left the board; each keeps no outcome and loses its folder once it
   * ended.
   */
  readonly stopRunsOfEndedJobs: (jobIsOnTheBoard: (jobId: string) => boolean) => void;
  /**
   * Stops every live line an earlier Hephaestus's runs left, and waits for their ends, then removes every run folder that holds no outcome:
   * its run died with the Hephaestus that started it.
   */
  readonly settleAtStart:       () => Promise<void>;
}

export interface MergedTreeGateRunsRequest {
  boardFolder:        string;
  wake:               (forced: boolean) => void;
  log:                (sentence: string) => void;
  /** Sends `stop` to every live line under the folder and waits, bounded, for their ends. */
  stopLiveLinesUnder: (folder: string) => Promise<void>;
}

interface RunInFlight {
  worktreePath:      string;
  ownerJobId:        string | null;
  stopController:    AbortController;
  removeFolderAtEnd: boolean;
  ended:             Promise<void>;
}

function runFolderNameOf(key: MergedTreeGateRunKey): string {
  const gatedEntityKeys = [...key.gatedEntities ?? []].toSorted().join(',');
  const entityPhaseHashes = Object.entries(key.stamp?.entityPhaseHashes ?? {})
    .map(([entityKey, phaseHash]) => `${entityKey}=${phaseHash}`)
    .toSorted()
    .join(',');
  const keyText = [key.worktreePath, key.treeId, key.phase, gatedEntityKeys, key.stamp?.phaseHash ?? '', entityPhaseHashes].join('\n');
  return createHash('sha256').update(keyText).digest('hex').slice(0, RUN_FOLDER_NAME_CHARACTERS);
}

function keptOutcomeIn(runFolder: string): MergedTreeGateOutcomeReading {
  return new MergedTreeGateOutcomeIngestion(join(runFolder, MERGED_TREE_GATE_OUTCOME_FILE)).read();
}

function runDescriptionOf(key: MergedTreeGateRunKey): string {
  return `${basename(key.worktreePath)} at tree ${key.treeId.slice(0, SHORT_TREE_CHARACTERS)} in phase ${key.phase}`;
}

function failureMessageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

export function createMergedTreeGateRuns(request: MergedTreeGateRunsRequest): MergedTreeGateRuns {
  const runsFolder = join(request.boardFolder, MERGED_TREE_GATE_RUNS_FOLDER);
  const runsInFlight = new Map<string, RunInFlight>();
  let stopping = false;

  function runFolderOf(key: MergedTreeGateRunKey): string {
    return join(runsFolder, runFolderNameOf(key));
  }

  /**
   * Never throws: a run that fails, was stopped, or whose outcome cannot be written, keeps none and waits for the next pass that asks. A run
   * whose line a clean quit of Talos paused wakes a pass, which asks again once a Talos serves the board.
   */
  async function runToItsEnd(runRequest: MergedTreeGateRunRequest, runFolder: string, run: RunInFlight): Promise<void> {
    const description = runDescriptionOf(runRequest);
    const stopSignal = run.stopController.signal;
    let ending: { verdict: 'kept'; gate: MergedTreeGate } | { verdict: 'not-kept'; failureMessage: string; paused: boolean };
    try {
      const gate = await runRequest.run(runFolder, stopSignal);
      if (stopSignal.aborted) throw new Error('the run was stopped while it ran');
      createMergedTreeGateOutcomeWriter(join(runFolder, MERGED_TREE_GATE_OUTCOME_FILE)).write(gate);
      ending = { verdict: 'kept', gate };
    } catch (failure) {
      ending = { verdict: 'not-kept', failureMessage: failureMessageOf(failure), paused: failure instanceof LinePausedError };
    }
    runsInFlight.delete(runFolder);
    if (run.removeFolderAtEnd) rmSync(runFolder, { recursive: true, force: true });
    if (ending.verdict === 'not-kept') {
      request.log(`The merged-tree gate of ${description} ended with no outcome: ${ending.failureMessage}`);
      if (ending.paused) request.wake(true);
      return;
    }
    request.log(`The merged-tree gate of ${description} ended: ${ending.gate.outcome}.`);
    request.wake(true);
  }

  function gateOf(runRequest: MergedTreeGateRunRequest): MergedTreeGate | 'running' {
    const runFolder = runFolderOf(runRequest);
    const kept = keptOutcomeIn(runFolder);
    if (kept.verdict === 'readable') return kept.gate;
    const runOfThisKey = runsInFlight.get(runFolder);
    if (runOfThisKey !== undefined && !runOfThisKey.stopController.signal.aborted) runOfThisKey.ownerJobId = runRequest.ownerJobId;
    if (stopping || runOfThisKey !== undefined) return 'running';
    // A run of another key on the same worktree, a pipeline changed under it, finishes before this one starts there.
    if ([...runsInFlight.values()].some((run) => run.worktreePath === runRequest.worktreePath)) return 'running';
    mkdirSync(runFolder, { recursive: true });
    // A kept outcome that cannot be read is no outcome: the run starts again and its own outcome replaces it.
    if (kept.verdict === 'unreadable') {
      const problemSentence = MergedTreeGateOutcomeProblemWording.sentenceOf(kept.problem);
      request.log(`The kept outcome of the merged-tree gate of ${runDescriptionOf(runRequest)} cannot be read (${problemSentence}).`);
    }
    request.log(`The merged-tree gate of ${runDescriptionOf(runRequest)} started.`);
    const run: RunInFlight = {
      worktreePath: runRequest.worktreePath, ownerJobId: runRequest.ownerJobId, stopController: new AbortController(), removeFolderAtEnd: false, ended: Promise.resolve()
    };
    runsInFlight.set(runFolder, run);
    run.ended = runToItsEnd(runRequest, runFolder, run);
    return 'running';
  }

  function settled(key: MergedTreeGateRunKey): void {
    rmSync(runFolderOf(key), { recursive: true, force: true });
  }

  async function stopAll(): Promise<void> {
    stopping = true;
    const runs = [...runsInFlight.values()];
    for (const run of runs) run.stopController.abort();
    await Promise.all(runs.map((run) => run.ended));
  }

  function stopForGood(run: RunInFlight): void {
    run.removeFolderAtEnd = true;
    run.stopController.abort();
  }

  async function stopRunsIn(worktreePath: string): Promise<void> {
    const runs = [...runsInFlight.values()].filter((run) => run.worktreePath === worktreePath);
    runs.forEach(stopForGood);
    await Promise.all(runs.map((run) => run.ended));
  }

  function stopRunsOfEndedJobs(jobIsOnTheBoard: (jobId: string) => boolean): void {
    for (const run of runsInFlight.values()) {
      if (run.ownerJobId !== null && !jobIsOnTheBoard(run.ownerJobId)) stopForGood(run);
    }
  }

  async function settleAtStart(): Promise<void> {
    await request.stopLiveLinesUnder(runsFolder);
    if (!existsSync(runsFolder)) return;
    for (const name of readdirSync(runsFolder)) {
      const runFolder = join(runsFolder, name);
      if (runsInFlight.has(runFolder)) continue;
      const kept = keptOutcomeIn(runFolder);
      if (kept.verdict === 'readable') continue;
      if (kept.verdict === 'unreadable') {
        const problemSentence = MergedTreeGateOutcomeProblemWording.sentenceOf(kept.problem);
        request.log(`The merged-tree gate run folder ${name} is removed: its kept outcome cannot be read (${problemSentence}).`);
      }
      rmSync(runFolder, { recursive: true, force: true });
    }
  }

  return {
    gateOf, settled, stopAll, stopRunsIn, stopRunsOfEndedJobs, settleAtStart
  };
}
