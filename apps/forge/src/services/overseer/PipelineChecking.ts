/**
 * The Overseer's pipeline checks: User's check of the open setup's draft runs the draft's prepare steps and the gates it changes or adds,
 * two times, in a fresh detached worktree of main, under each gate's confinement and with no `writes` granted, holding a gate run slot that
 * no waiting real gate wants. The process runs outside the hold; the hold is taken only to mark the check running and to store its end,
 * which the record's pipeline agent then reads as a message. At an Overseer's start, a check an earlier Overseer left running reads
 * `stopped`, and every check worktree goes. On a draft over entities each entity the draft touched has its own check: its steps and gates
 * run from its first home, and its session hears the end.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join }                               from 'node:path';

import { GitProcess }                                                                     from '../../lib/git/GitProcess.ts';
import { GitWorktrees, REAL_WORKTREE_REMOVAL_PRIMITIVES, type WorktreeRemovalPrimitives } from '../../lib/git/GitWorktrees.ts';
import type { PlatformPorts }                                                             from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                                           from '../../lib/process-identity/ProcessIdentity.ts';
import type { EntityKey }                                                                 from '../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineCheckEnding, PipelineCheckResult, PipelineCheckStart }              from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                                                     from '../../lib/tracker-model/Board.ts';
import { CHECK_OUTPUT_LIMIT_CHARACTERS, NO_TOUCHED_GATE_REASON }                          from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import type { SetupMessage }                                                              from '../../shared/@types/ControlContext.ts';
import { EntityFoldersUtil }                                                              from '../../shared/utils/EntityFoldersUtil.ts';
import { messagedToTheSetupAgent }                                                        from '../control/PipelineSetupControls.ts';
import type { GateLineConfiner }                                                          from '../lifecycle/GateRun.ts';
import type { ProposalRunRecord, ProposalTwiceRun }                                       from '../lifecycle/ProposalTwiceRun.ts';
import { projectLocationOf }                                                              from '../tracker/ProjectLocation.ts';
import type { Workspace }                                                                 from '../tracker/Workspace.ts';
import { GateRunSlots }                                                                   from './GateRunSlots.ts';

/** The check worktrees' folder under the worktrees root, one `<setupId>` worktree each, `<setupId>-<entity>` for an entity's; the Overseer owns it. */
export const PIPELINE_CHECK_WORKTREES_FOLDER = 'pipeline-checks';

/** The stored reason of a check whose main line resolved to no commit. */
const MAIN_LINE_UNRESOLVED_REASON = 'main-line-unresolved';

export interface PipelineCheckHold {
  board: Board;
  at:    string;
}

export interface PipelineCheckingContext {
  workspace:             Workspace;
  worktreesRoot:         string;
  mainLine:              string;
  platformPorts:         Pick<PlatformPorts, 'shellLine' | 'processSupervision'>;
  gateSlots:             Pick<ReturnType<typeof GateRunSlots.createGateRunSlots>, 'tryAcquireAfterRealGates' | 'release'>;
  gateEnvironment:       () => Readonly<Record<string, string>>;
  /** Confines each line of the check in its worktree, as a gate of the Overseer's is confined; `checkName` names the check's own profile. */
  confinedLineIn:        (worktreePath: string, checkName: string) => GateLineConfiner;
  hold:                  <Result>(mutate: (hold: PipelineCheckHold) => Result) => Promise<Result>;
  /** A clock exception: a run's duration is only recorded and shown. */
  millisecondsNow:       () => number;
  /** Asks for a pass, so a waiting gate may take the freed slot. */
  wake:                  () => void;
  log:                   (line: string) => void;
  runProposalTwice:      typeof ProposalTwiceRun.runProposalTwice;
  /** Words the check's end for the pipeline agent, since only `cli/` holds words. */
  setupMessageWordingOf: (message: SetupMessage) => string;
  removalPrimitives?:    WorktreeRemovalPrimitives;
}

export interface PipelineChecking {
  /** After a pass: starts the open record's queued check when a slot is free after the real gates. */
  followChecks:  (board: Board) => void;
  /** Before the first pass: a check left running reads `stopped`, and every check worktree is removed. */
  settleAtStart: () => Promise<void>;
  /** The Overseer stops: the running check's process tree is ended, and the check reads `stopped`. */
  stopAll:       () => Promise<void>;
  /** Resolves once no check of this Overseer is going. */
  idle:          () => Promise<void>;
}

/** One queued check: the record's, at the forge (`undefined`) or at one entity. */
interface CheckLevel {
  setupId:   string;
  entityKey: EntityKey | undefined;
  /** The worktree's and the profile's name: the setup id, and for an entity its key, escaped as a file name. */
  checkName: string;
}

interface CheckInThisProcess {
  promise:  Promise<void>;
  /** The line now running, `null` between lines. */
  process:  ProcessIdentity | null;
  stopping: boolean;
}

/** The end of the output, which is where a failing gate says why. */
function outputTailOf(output: string): string {
  return output.length <= CHECK_OUTPUT_LIMIT_CHARACTERS ? output : output.slice(-CHECK_OUTPUT_LIMIT_CHARACTERS);
}

function checkLevelOf(setupId: string, entityKey: EntityKey | null): CheckLevel {
  if (entityKey === null) return { setupId, entityKey: undefined, checkName: setupId };
  return { setupId, entityKey, checkName: `${setupId}-${encodeURIComponent(entityKey)}` };
}

/** An entity's steps and gates read their folders from its first home; the forge's run as the draft names them. */
function rootedStartOf(started: PipelineCheckStart): Pick<PipelineCheckStart, 'prepare' | 'gates'> {
  const { entityHome } = started;
  if (entityHome === undefined) return { prepare: started.prepare, gates: started.gates };
  return {
    prepare: EntityFoldersUtil.rootedStepsOf(started.prepare, entityHome),
    gates:   started.gates.map((gate) => EntityFoldersUtil.rootedGateOf(gate, entityHome)),
  };
}

/** The log and the record store whole milliseconds, and a clock may answer a fraction. */
function checkResultOf(record: ProposalRunRecord): PipelineCheckResult {
  return {
    snapshotCommit: record.snapshotCommit,
    prepare:        { failedSteps: [...record.prepare.failedSteps], output: outputTailOf(record.prepare.output) },
    gates:          record.gates.map((gate) => ({
      name:                  gate.name,
      outcomes:              [...gate.outcomes],
      durationsMilliseconds: gate.durationsMilliseconds.map((milliseconds) => Math.round(milliseconds)),
      verdict:               gate.verdict,
      output:                outputTailOf(gate.output),
    })),
  };
}

function createPipelineChecking(context: PipelineCheckingContext): PipelineChecking {
  const checksInThisProcess = new Map<string, CheckInThisProcess>();
  const { workspace, platformPorts } = context;
  const worktreesFolder = join(context.worktreesRoot, PIPELINE_CHECK_WORKTREES_FOLDER);
  const removalPrimitives = context.removalPrimitives ?? REAL_WORKTREE_REMOVAL_PRIMITIVES;
  // Git runs at the repository's root, and the lines in the project's folder of each checkout.
  const { repositoryRoot, projectPrefix } = projectLocationOf(workspace.rootDirectory);

  function removeWorktree(worktreePath: string): void {
    const removal = GitWorktrees.removeWithRetry({ repositoryDirectory: repositoryRoot, worktreePath, force: 'force' }, removalPrimitives);
    if (removal.verdict === 'left') context.log(`The pipeline check worktree ${worktreePath} is a leftover: ${removal.reason}`);
  }

  function stopProcessTree(running: CheckInThisProcess): void {
    running.stopping = true;
    if (running.process === null) return;
    const { processSupervision } = platformPorts;
    const members = processSupervision.treeMembersOf(running.process) ?? undefined;
    const stop = processSupervision.stopTree(running.process, 'force', members);
    if (stop.verdict === 'refused') context.log(`The stop of a pipeline check was refused: ${stop.reason}`);
  }

  /** The record keeps the end, and the session of the check's level hears it in the same hold; a record that moved on keeps nothing. */
  function recordEnding(board: Board, level: CheckLevel, ending: PipelineCheckEnding, at: string): void {
    const { setupId, entityKey } = level;
    const ended = board.endPipelineCheck(setupId, ending, entityKey);
    const check = entityKey === undefined ? ended?.setup.check : ended?.setup.entities?.[entityKey]?.check;
    if (ended === null || check === undefined) return;
    messagedToTheSetupAgent(ended, board, context.setupMessageWordingOf({ kind: 'check-ended', setupId, check }), at, entityKey);
  }

  async function endingOf(checkName: string, started: PipelineCheckStart, worktreePath: string, running: CheckInThisProcess): Promise<PipelineCheckEnding> {
    const snapshotCommit = GitProcess.resolvedCommitOf(repositoryRoot, context.mainLine);
    if (snapshotCommit === null) return { state: 'cannot-run', reason: MAIN_LINE_UNRESOLVED_REASON };
    const added = GitProcess.run(repositoryRoot, ['worktree', 'add', '--quiet', '--detach', worktreePath, snapshotCommit]);
    if (!GitProcess.succeeded(added)) return { state: 'cannot-run', reason: GitProcess.failureReasonOf(added, ['worktree', 'add']) };
    const record = await context.runProposalTwice({
      shellLine:       platformPorts.shellLine,
      environment:     context.gateEnvironment(),
      spawnOptions:    platformPorts.processSupervision.spawnOptionsFor('gate'),
      confinedLineOf:  context.confinedLineIn(worktreePath, checkName),
      ...rootedStartOf(started),
      directory:       worktreePath,
      projectPrefix,
      snapshotCommit,
      millisecondsNow: context.millisecondsNow,
      grantsWrites:    false,
      onSpawned:       (processId) => {
        running.process = platformPorts.processSupervision.identityOf(processId);
        if (running.stopping) stopProcessTree(running);
      },
    });
    running.process = null;
    return 'verdict' in record ? { state: 'cannot-run', reason: record.reason } : { state: 'checked', result: checkResultOf(record) };
  }

  /** Never throws: a failure is logged, and the check reads `stopped` at the next start. */
  async function runCheck(level: CheckLevel, holder: string, running: CheckInThisProcess): Promise<void> {
    const { setupId, entityKey, checkName } = level;
    const worktreePath = join(worktreesFolder, checkName);
    try {
      const started = await context.hold(({ board, at }) => {
        const start = board.startPipelineCheck(setupId, entityKey);
        if (start === null || start.gates.length > 0) return start;
        // The draft changed back since User's press, so no gate is left to run.
        recordEnding(board, level, { state: 'cannot-run', reason: NO_TOUCHED_GATE_REASON }, at);
        return null;
      });
      if (started === null) return;
      mkdirSync(worktreesFolder, { recursive: true });
      const ending = await endingOf(checkName, started, worktreePath, running);
      await context.hold(({ board, at }) => {
        // A check this Overseer ended as it stopped has no result.
        if (running.stopping) board.stopRunningPipelineCheck();
        else recordEnding(board, level, ending, at);
      });
    } catch (failure) {
      context.log(`Pipeline check of setup ${setupId} failed and waits for the next start: ${failure instanceof Error ? failure.message : String(failure)}`);
    } finally {
      context.gateSlots.release(holder);
      if (existsSync(worktreePath)) removeWorktree(worktreePath);
      checksInThisProcess.delete(checkName);
      context.wake();
    }
  }

  /** Each queued check of the record starts while a slot is free after the real gates: the forge's, or each entity's in record order. */
  function followChecks(board: Board): void {
    const setup = board.pipelineSetup();
    if (setup === null) return;
    for (const entityKey of board.queuedPipelineCheckLevels()) {
      const level = checkLevelOf(setup.setupId, entityKey);
      if (checksInThisProcess.has(level.checkName)) continue;
      const holder = GateRunSlots.inProcessHolderOf(`pipeline-check:${level.checkName}`);
      if (!context.gateSlots.tryAcquireAfterRealGates(holder)) return;
      const running: CheckInThisProcess = { promise: Promise.resolve(), process: null, stopping: false };
      checksInThisProcess.set(level.checkName, running);
      running.promise = runCheck(level, holder, running);
    }
  }

  async function settleAtStart(): Promise<void> {
    await context.hold(({ board }) => board.stopRunningPipelineCheck());
    if (!existsSync(worktreesFolder)) return;
    for (const name of readdirSync(worktreesFolder)) removeWorktree(join(worktreesFolder, name));
  }

  async function stopAll(): Promise<void> {
    for (const running of checksInThisProcess.values()) stopProcessTree(running);
    await idle();
  }

  async function idle(): Promise<void> {
    await Promise.all([...checksInThisProcess.values()].map((running) => running.promise));
  }

  return {
    followChecks, settleAtStart, stopAll, idle
  };
}

export const PipelineChecking = Object.freeze({ createPipelineChecking });
