/**
 * The gate pipeline run on a tree, the code the Overseer's build, review and merge gates share: the prepare steps, then each gate of the
 * phase in its run order, the first red one stopping the rest. Each argv arrives built and confined by the caller; a step runs as a line
 * child of Talos through the caller's `LineRunner`, in a child folder of its own and within the line time bound, with the job variables
 * removed from its environment. agent-progress keeps no gate result: caching is the repository's own tooling's, and a gate may only report
 * what its tooling did, at the report path each gate line is handed. On a pipeline with entities, each gated entity's part runs in turn,
 * its steps' folders read from its first home folder and its lines in a part folder of their own.
 */
import { createHash, randomUUID }  from 'node:crypto';
import { readFileSync, rmSync }    from 'node:fs';
import { tmpdir }                  from 'node:os';
import { basename, dirname, join } from 'node:path';

import { GateReportFile }                                   from '../../adapters/pipeline/GateReportFile.ts';
import type { ConfinedLine }                                from '../../lib/gate-confinement/ConfinedLine.ts';
import { GitProcess }                                       from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                     from '../../lib/git/GitWorktrees.ts';
import type { ShellExitReport, ShellLine, ShellRunRefusal } from '../../lib/shell-line/ShellLine.ts';
import type { ChildEndReason }                              from '../../lib/talos/ChildRecord.ts';
import type { GatePhase }                                   from '../../lib/tracker-model/@types/GatePhase.ts';
import type {
  GateCacheReport,
  GateCacheReportOfGate,
  GateOutcome,
  PipelineStepKind,
  PipelineStepRun
} from '../../lib/tracker-model/@types/Job.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineGate,
  PipelineStep
} from '../../lib/tracker-model/@types/Pipeline.ts';
import { EntityOwnershipUtil }                                             from '../../lib/tracker-model/utils/EntityOwnershipUtil.ts';
import { PipelineUtil }                                                    from '../../lib/tracker-model/utils/PipelineUtil.ts';
import { GATE_REPORT_VARIABLE, HATCH_DIRECTORY_VARIABLE, JOB_ID_VARIABLE } from '../../shared/Environment.ts';
import { LINE_TIME_BOUND_MILLISECONDS }                                    from '../../shared/constants/OverseerLimits.ts';
import { ProjectPathsUtil }                                                from '../../shared/utils/ProjectPathsUtil.ts';

export interface LineRunRequest {
  /** The step's child folder under the board folder, from the run's `childFolder`. */
  childFolder:           string;
  argv:                  readonly string[];
  verbatimArguments:     boolean;
  directory:             string;
  environment:           Readonly<Record<string, string>>;
  label:                 string;
  timeBoundMilliseconds: number | null;
  onOutputLine?:         (line: string) => void;
  /** Aborted when the run's owner stops it: a line not yet launched never is, and a launched one is stopped at once. */
  stopSignal?:           AbortSignal;
}

export interface LineRunEnd {
  exitCode:        number | null;
  signalCode:      string | null;
  endReason:       ChildEndReason | 'talos-unavailable';
  output:          string;
  /** The child end's `runMilliseconds`; 0 when Talos was unavailable. */
  runMilliseconds: number;
}

export type LineRunner = (request: LineRunRequest) => Promise<LineRunEnd>;

/** A clean quit of Talos paused the line: it is never judged, and the run that holds it keeps no verdict, so it runs again. */
export class LinePausedError extends Error {
  constructor(childFolder: string) {
    super(`Talos paused the line in ${childFolder} as it quit cleanly; the run is not judged and runs again`);
    this.name = 'LinePausedError';
  }
}

export interface GateRequest {
  argv:               readonly string[];
  /** The shell line's answer, handed to the spawn so a Windows line reaches cmd.exe unquoted; absent reads as `false`. */
  verbatimArguments?: boolean;
  /** Where the line may record its whole status, read back after the exit and removed; absent, no status is read, so none can pass. */
  statusFile?:        string;
  /** Handed to the line in `FORGE_GATE_REPORT`, read back after the exit and removed; absent, the line is handed no report path. */
  reportFile?:        string;
  directory:          string;
  /** The whole child environment, already narrowed (`launchEnvironmentOf`); the job variables are removed from it. */
  environment:        Readonly<Record<string, string>>;
  runLine:            LineRunner;
  /** The line's own child folder under the board folder. */
  childFolder:        string;
  /** Told each line of output as Talos records it, standard output and standard error alike. */
  onOutputLine?:      (line: string) => void;
}

export interface GateProcessRun {
  /** `null` when the gate could not be started, or ended by a signal. */
  exitCode:        number | null;
  signalCode:      string | null;
  /** The status file's text, `null` when the line wrote none. */
  recordedStatus:  string | null;
  /** What the line reported at its report path, `null` when it was handed none or reported nothing readable. */
  cacheReport:     GateCacheReport | null;
  output:          string;
  /** How Talos ended the line, `talos-unavailable` when none took it or Talos refused it. */
  endReason:       LineRunEnd['endReason'];
  /** Awake time from the spawn to the end, the bound's measure; 0 when it never ran. */
  runMilliseconds: number;
}

/** A line ready to spawn, or the reason it never starts: its shell cannot run in the folder, or the confinement port refused it. */
export type RunnableLine =
  | { verdict: 'runs'; argv: readonly string[]; verbatimArguments: boolean }
  | { verdict: 'refused'; reason: string };

/** What one step may reach besides its tree and temp: the network when it names domains (a prepare step always), and the folders it writes. */
export interface GateConfinement {
  network:        boolean;
  networkDomains: readonly string[];
  writes:         readonly string[];
}

export interface PipelineRunRequest {
  shellLine:        ShellLine;
  prepare:          readonly PipelineStep[];
  /** The gates of the phase being run, in its run order; with none, no prepare step runs either. */
  gates:            readonly PipelineGate[];
  /** The checkout of the tree the pipeline judges, where git runs; a step runs in the project's folder of it. */
  directory:        string;
  /** The tracker's project folder below the checkout's root, `/`-separated; absent for a tracker at its repository's root. */
  projectPrefix?:   string;
  environment:      Readonly<Record<string, string>>;
  confinedLineOf:   GateLineConfiner;
  runLine:          LineRunner;
  /** The run's folder under the board folder; each step's line runs in `prepare-<i>` or `gate-<i>` below it, numbered from 1. */
  childFolder:      string;
  /** Waits for one of the machine's gate run slots for the gate's child folder, its holder, and answers its release; prepare steps take none. */
  acquireGateSlot?: (holder: string) => Promise<() => void>;
  /** Told each line of every step's output as Talos records it. */
  onOutputLine?:    (line: string) => void;
}

/** A step's argv in its confinement, or the refusal that keeps it from running. */
export type GateLineConfiner = (argv: readonly string[], confinement: GateConfinement) => ConfinedLine;

/** What every run's verdict carries: each gate's cache report, and each step line that ran with its run time, both in run order. */
interface PipelineRunRecords {
  gatesRun:     string[];
  cacheReports: GateCacheReportOfGate[];
  stepRuns:     PipelineStepRun[];
}

export type PipelineVerdict =
  | { outcome: 'setup-failed'; step: string; output: string } & PipelineRunRecords
  /** `output` is the port's reason; the step never started. */
  | { outcome: 'sandbox-unavailable'; step: string; output: string } & PipelineRunRecords
  | { outcome: 'passed' } & PipelineRunRecords
  | { outcome: Exclude<GateOutcome, 'passed'>; gate: string; output: string } & PipelineRunRecords;

/** One entity's part of a gate run of entities: its prepare steps and the phase's gates, each step's folder read from its first home. */
export interface EntityPipelineRun {
  entityKey:  EntityKey;
  prepare:    readonly PipelineStep[];
  gates:      readonly PipelineGate[];
  /** The entity's first home folder below the checkout's root, `/`-separated with no leading `/`; `''` for a home at the root. */
  homePrefix: string;
}

/** A gate run of entities: what a single run takes but its steps and its folder, which each entity brings; each part runs in `part-<p>`. */
export type EntityPipelinesRunRequest = Omit<PipelineRunRequest, 'prepare' | 'gates' | 'projectPrefix'>;

/** A single run's verdict; `entity` names the entity whose step or gate stopped the run, absent on a pass. */
export type EntityPipelinesVerdict = PipelineVerdict & { entity?: EntityKey };

const JOB_VARIABLES: readonly string[] = [JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE];

const LINE_STATUS_FILE_PREFIX = 'line-status-';

const GATE_REPORT_FILE_PREFIX = 'gate-report-';

/**
 * Without the job variables' removal, every spec of a gated tree that runs a mutating verb would Hatch it to the Overseer rather than run
 * it. The report path is the line's own: one this process inherited is never passed on.
 */
function gateEnvironmentOf(environment: Readonly<Record<string, string>>, reportFile?: string): Record<string, string> {
  const kept = Object.entries(environment).filter(([name]) => !JOB_VARIABLES.includes(name) && name !== GATE_REPORT_VARIABLE);
  return Object.fromEntries(reportFile === undefined ? kept : [...kept, [GATE_REPORT_VARIABLE, reportFile]]);
}

/** A fresh path in the temporary folder for one line's status; nothing is created until the line writes it. */
function lineStatusFileOf(): string {
  return join(tmpdir(), `${LINE_STATUS_FILE_PREFIX}${randomUUID()}`);
}

/** A fresh path in the temporary folder, which every confinement lets a line write, for one gate's report. */
function gateReportFileOf(): string {
  return join(tmpdir(), `${GATE_REPORT_FILE_PREFIX}${randomUUID()}.json`);
}

/**
 * A step a Watcher runs is read in a later pass, perhaps by the next Overseer, so its report path in the temporary folder is derived from
 * the step's own folder rather than drawn fresh.
 */
function gateReportFileFor(stepFolder: string): string {
  return join(tmpdir(), `${GATE_REPORT_FILE_PREFIX}${createHash('sha256').update(stepFolder).digest('hex')}.json`);
}

/** What the line reported at `reportFile`, which is removed, so no later run of the same step reads it. */
function takeCacheReport(reportFile: string): GateCacheReport | null {
  const cacheReport = GateReportFile.read(reportFile);
  rmSync(reportFile, { force: true, recursive: true });
  return cacheReport;
}

/** What the line recorded as its status, `null` when it wrote nothing. */
function recordedStatusOf(statusFile: string): string | null {
  try {
    return readFileSync(statusFile, 'utf8');
  } catch {
    return null;
  }
}

const RUN_REFUSAL_WORDING: Readonly<Record<ShellRunRefusal, (directory: string) => string>> = {
  'network-share-folder':    (directory) => `cmd.exe runs no line in the network share folder ${directory}; move the repository to a drive letter`,
  'no-absolute-interpreter': () => 'no absolute cmd.exe path is known: ComSpec and SystemRoot are both unset or relative',
};

function runRefusalReasonOf(refusal: ShellRunRefusal, directory: string): string {
  return RUN_REFUSAL_WORDING[refusal](directory);
}

const MILLISECONDS_PER_MINUTE = 60_000;

const PREPARE_STEP_FOLDER_PREFIX = 'prepare-';
const GATE_STEP_FOLDER_PREFIX = 'gate-';
const ENTITY_PART_FOLDER_PREFIX = 'part-';

/** The child folder of a run's prepare step or gate at `index`, counted from 1. */
function stepFolderOf(childFolder: string, kind: 'prepare' | 'gate', index: number): string {
  return join(childFolder, `${kind === 'prepare' ? PREPARE_STEP_FOLDER_PREFIX : GATE_STEP_FOLDER_PREFIX}${index + 1}`);
}

/** The folder of an entity's part at `index` of a gate run of entities, counted from 1, so two parts never share a step folder. */
function entityPartFolderOf(childFolder: string, index: number): string {
  return join(childFolder, `${ENTITY_PART_FOLDER_PREFIX}${index + 1}`);
}

/** The label Talos logs for a line: its run folder's name and its own. */
function lineLabelOf(childFolder: string): string {
  return `${basename(dirname(childFolder))}/${basename(childFolder)}`;
}

const TALOS_UNAVAILABLE_LINE = 'Talos did not run the line; the gate cannot run until a Talos serves the board and takes it.';

/** The line a step's output gets when Talos stopped it at its time bound, which a sleep never counts towards. */
function timeBoundLineOf(timeBoundMilliseconds: number): string {
  return `The line ran past its bound of ${timeBoundMilliseconds / MILLISECONDS_PER_MINUTE} minutes of awake time and was stopped.`;
}

/** The shell's refusal for the folder comes first, so a line its shell cannot run is never handed to the confinement port. */
function runnableLineOf(
  { shellLine, confinedLineOf }: Pick<PipelineRunRequest, 'shellLine' | 'confinedLineOf'>,
  line: string,
  place: { directory: string; statusFile: string },
  confinement: GateConfinement,
): RunnableLine {
  const refusal = shellLine.runRefusalOf(place.directory);
  if (refusal !== null) return { verdict: 'refused', reason: runRefusalReasonOf(refusal, place.directory) };
  const spawnRequest = shellLine.spawnRequestOf(line, place.statusFile);
  const confined = confinedLineOf(spawnRequest.argv, confinement);
  return confined.verdict === 'refused' ? confined : { verdict: 'runs', argv: confined.argv, verbatimArguments: spawnRequest.verbatimArguments };
}

/** Line ends that ran nothing to time: no Talos took the line, or its process never started. */
const END_REASONS_OF_NO_RUN: ReadonlySet<GateProcessRun['endReason']> = new Set(['talos-unavailable', 'spawn-failed']);

/** The step's run with its run time, as its `pipeline-step-ran` record keeps it; none for a line that never ran. */
function stepRunsOf(stepKind: PipelineStepKind, stepName: string, run: Pick<GateProcessRun, 'endReason' | 'runMilliseconds'>, passed: boolean): PipelineStepRun[] {
  if (END_REASONS_OF_NO_RUN.has(run.endReason)) return [];
  const ending = run.endReason === 'time-bound' ? 'time-bound' : passed ? 'passed' : 'failed';
  return [{
    stepKind, stepName, runMilliseconds: run.runMilliseconds, ending
  }];
}

/** The line's output, with a closing sentence when Talos stopped it at its bound or no Talos ran it. */
function gateOutputOf(end: LineRunEnd): string {
  if (end.endReason === 'time-bound') return `${end.output}${timeBoundLineOf(LINE_TIME_BOUND_MILLISECONDS)}\n`;
  if (end.endReason === 'talos-unavailable') return `${end.output}${TALOS_UNAVAILABLE_LINE}\n`;
  return end.output;
}

/** A line Talos paused is never judged: the throw reaches the run's owner, so the run keeps no verdict. */
async function runGate({
  argv, verbatimArguments, statusFile, reportFile, directory, environment, runLine, childFolder, onOutputLine
}: GateRequest): Promise<GateProcessRun> {
  let end: LineRunEnd;
  try {
    end = await runLine({
      childFolder,
      argv,
      verbatimArguments:     verbatimArguments === true,
      directory,
      environment:           gateEnvironmentOf(environment, reportFile),
      label:                 lineLabelOf(childFolder),
      timeBoundMilliseconds: LINE_TIME_BOUND_MILLISECONDS,
      ...(onOutputLine === undefined ? {} : { onOutputLine }),
    });
  } catch (error) {
    if (statusFile !== undefined) rmSync(statusFile, { force: true });
    if (reportFile !== undefined) rmSync(reportFile, { force: true, recursive: true });
    return {
      exitCode:        null,
      signalCode:      null,
      recordedStatus:  null,
      cacheReport:     null,
      output:          error instanceof Error ? error.message : String(error),
      endReason:       'talos-unavailable',
      runMilliseconds: 0,
    };
  }
  try {
    if (end.endReason === 'paused') throw new LinePausedError(childFolder);
    return {
      exitCode:        end.exitCode,
      signalCode:      end.signalCode,
      recordedStatus:  statusFile === undefined ? null : recordedStatusOf(statusFile),
      cacheReport:     reportFile === undefined ? null : GateReportFile.read(reportFile),
      output:          gateOutputOf(end),
      endReason:       end.endReason,
      runMilliseconds: end.runMilliseconds,
    };
  } finally {
    if (statusFile !== undefined) rmSync(statusFile, { force: true });
    if (reportFile !== undefined) rmSync(reportFile, { force: true, recursive: true });
  }
}

/** The diff of every tracked file a step changed against HEAD; empty when the tree is as it was. */
function trackedChangesOf(directory: string): string {
  const run = GitProcess.run(directory, ['diff', '--no-ext-diff', 'HEAD', '--'], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
  return GitProcess.succeeded(run) ? run.standardOutput : '';
}

/**
 * A prepare step passes only when it exits 0 and leaves every tracked file as it was, so a gate is never blamed for its change. `null` on a
 * pass; otherwise what its setup failure reports: its own output, or the diff it left.
 */
function prepareFailureOutputOf(shellLine: ShellLine, run: ShellExitReport & { output: string }, directory: string): string | null {
  if (shellLine.exitMeaningOf(run) !== 'passed') return run.output;
  const trackedChanges = trackedChangesOf(directory);
  return trackedChanges === '' ? null : trackedChanges;
}

/** What a gate's judgement reads of its run. */
type JudgedRun = ShellExitReport & Pick<GateProcessRun, 'output'>;

/** A gate passes only when it exits 0 and leaves the tree unchanged. */
function gateOutcomeOf(shellLine: ShellLine, run: JudgedRun, trackedChanges = ''): GateOutcome {
  const exitMeaning = shellLine.exitMeaningOf(run);
  if (exitMeaning === 'cannot-run') return 'cannot-run';
  return exitMeaning === 'passed' && trackedChanges === '' ? 'passed' : 'failed';
}

/** A gate that passed but changed the tree reports the diff; any other run its own output. */
function gateErrorOutputOf(shellLine: ShellLine, run: JudgedRun, trackedChanges: string): string {
  return shellLine.exitMeaningOf(run) === 'passed' && trackedChanges !== '' ? trackedChanges : run.output;
}

/**
 * The folder a step runs in: the project's folder of the checkout, or its `in` folder, relative to the project or, leading with `/`, to the
 * checkout's root. A prepare step's folder reads as a gate's does.
 */
function gateDirectoryOf(checkoutDirectory: string, step: Readonly<Pick<PipelineGate, 'in'>>, projectPrefix = ''): string {
  if (step.in === undefined && projectPrefix === '') return checkoutDirectory;
  return join(checkoutDirectory, ProjectPathsUtil.toRepositoryPath(projectPrefix, step.in ?? ''));
}

/** An entity's first home folder as a prefix below the checkout's root, from which its steps' folders read; a home at the root is `''`. */
function homePrefixOf(firstHome: string): string {
  return EntityOwnershipUtil.homeFolderOf(firstHome).replace(/^\/+/u, '');
}

/** The part each gated entity of the pipeline runs in `phase`, in the order given; a key the pipeline has no entity for runs nothing. */
function entityPipelinesOf(pipeline: Readonly<Pipeline>, entityKeys: readonly EntityKey[], phase: GatePhase): EntityPipelineRun[] {
  return entityKeys.flatMap((entityKey) => {
    const entityPipeline = PipelineUtil.pipelineOfEntity(pipeline, entityKey);
    if (entityPipeline === null) return [];
    const firstHome = pipeline.entities?.[entityKey]?.home[0] ?? '/';
    return [{
      entityKey, prepare: entityPipeline.prepare, gates: PipelineUtil.gatesOfPhase(entityPipeline, phase), homePrefix: homePrefixOf(firstHome)
    }];
  });
}

function gateConfinementOf(gate: Readonly<PipelineGate>): GateConfinement {
  const networkDomains = gate.network ?? [];
  return { network: networkDomains.length > 0, networkDomains, writes: gate.writes ?? [] };
}

/** A prepare step installs, so it reaches the network and writes every folder a gate it prepares for may. */
function prepareConfinementOf(gates: readonly PipelineGate[]): GateConfinement {
  return { network: true, networkDomains: [], writes: [...new Set(gates.flatMap((gate) => gate.writes ?? []))] };
}

/**
 * A prepare step that does not pass, or changes a tracked file, is a setup failure, never a red gate; the Overseer never runs a gate's
 * `fix`. A phase with no gates passes at once: its prepare steps would prepare for nothing.
 */
async function runPipeline(request: PipelineRunRequest): Promise<PipelineVerdict> {
  if (request.gates.length === 0) return {
    outcome: 'passed', gatesRun: [], cacheReports: [], stepRuns: []
  };
  const prepareConfinement = prepareConfinementOf(request.gates);
  const {
    shellLine, environment, runLine, onOutputLine
  } = request;
  const listeners = onOutputLine === undefined ? {} : { onOutputLine };
  const stepRuns: PipelineStepRun[] = [];
  for (const [stepIndex, step] of request.prepare.entries()) {
    const statusFile = lineStatusFileOf();
    const stepDirectory = gateDirectoryOf(request.directory, step, request.projectPrefix);
    const line = runnableLineOf(request, step.run, { directory: stepDirectory, statusFile }, prepareConfinement);
    if (line.verdict === 'refused') return {
      outcome: 'sandbox-unavailable', step: step.name, output: line.reason, gatesRun: [], cacheReports: [], stepRuns
    };
    const run = await runGate({
      argv:              line.argv,
      verbatimArguments: line.verbatimArguments,
      statusFile,
      directory:         stepDirectory,
      environment,
      runLine,
      childFolder:       stepFolderOf(request.childFolder, 'prepare', stepIndex),
      ...listeners,
    });
    const failureOutput = prepareFailureOutputOf(shellLine, run, request.directory);
    stepRuns.push(...stepRunsOf('prepare', step.name, run, failureOutput === null));
    if (failureOutput !== null) return {
      outcome: 'setup-failed', step: step.name, output: failureOutput, gatesRun: [], cacheReports: [], stepRuns
    };
  }
  const gatesRun: string[] = [];
  const cacheReports: GateCacheReportOfGate[] = [];
  for (const [gateIndex, gate] of request.gates.entries()) {
    const statusFile = lineStatusFileOf();
    const directory = gateDirectoryOf(request.directory, gate, request.projectPrefix);
    const line = runnableLineOf(request, gate.run, { directory, statusFile }, gateConfinementOf(gate));
    if (line.verdict === 'refused') return {
      outcome: 'sandbox-unavailable', step: gate.name, output: line.reason, gatesRun, cacheReports, stepRuns
    };
    const gateFolder = stepFolderOf(request.childFolder, 'gate', gateIndex);
    const releaseGateSlot = request.acquireGateSlot === undefined ? null : await request.acquireGateSlot(gateFolder);
    let run: GateProcessRun;
    try {
      gatesRun.push(gate.name);
      run = await runGate({
        argv:              line.argv,
        verbatimArguments: line.verbatimArguments,
        statusFile,
        reportFile:        gateReportFileOf(),
        directory,
        environment,
        runLine,
        childFolder:       gateFolder,
        ...listeners,
      });
    } finally {
      releaseGateSlot?.();
    }
    cacheReports.push({ gateName: gate.name, cacheReport: run.cacheReport });
    const trackedChanges = trackedChangesOf(request.directory);
    const outcome = gateOutcomeOf(shellLine, run, trackedChanges);
    stepRuns.push(...stepRunsOf('gate', gate.name, run, outcome === 'passed'));
    if (outcome !== 'passed') return {
      outcome, gate: gate.name, output: gateErrorOutputOf(shellLine, run, trackedChanges), gatesRun, cacheReports, stepRuns
    };
  }
  return {
    outcome: 'passed', gatesRun, cacheReports, stepRuns
  };
}

/**
 * Each entity's part in turn, as a single run from its first home folder and in its own part folder, through `runOnePipeline`; the first
 * part that does not pass ends the run, named by its entity. The gates run, their cache reports and the step runs are every part's, in run
 * order, each step run named by its part's entity.
 */
async function runEntityPipelines(
  request: EntityPipelinesRunRequest,
  entityPipelines: readonly EntityPipelineRun[],
  runOnePipeline: (pipelineRequest: PipelineRunRequest) => Promise<PipelineVerdict> = runPipeline,
): Promise<EntityPipelinesVerdict> {
  const gatesRun: string[] = [];
  const cacheReports: GateCacheReportOfGate[] = [];
  const stepRuns: PipelineStepRun[] = [];
  for (const [partIndex, {
    entityKey, prepare, gates, homePrefix
  }] of entityPipelines.entries()) {
    const verdict = await runOnePipeline({
      ...request, prepare, gates, projectPrefix: homePrefix, childFolder: entityPartFolderOf(request.childFolder, partIndex)
    });
    gatesRun.push(...verdict.gatesRun);
    cacheReports.push(...verdict.cacheReports);
    stepRuns.push(...verdict.stepRuns.map((stepRun) => ({ ...stepRun, entity: entityKey })));
    if (verdict.outcome !== 'passed') return {
      ...verdict, gatesRun, cacheReports, stepRuns, entity: entityKey
    };
  }
  return {
    outcome: 'passed', gatesRun, cacheReports, stepRuns
  };
}

export const GateRun = Object.freeze({
  gateEnvironmentOf,
  gateOutcomeOf,
  gateErrorOutputOf,
  prepareFailureOutputOf,
  gateDirectoryOf,
  homePrefixOf,
  entityPipelinesOf,
  gateConfinementOf,
  prepareConfinementOf,
  trackedChangesOf,
  lineStatusFileOf,
  gateReportFileOf,
  gateReportFileFor,
  takeCacheReport,
  recordedStatusOf,
  runRefusalReasonOf,
  timeBoundLineOf,
  stepRunsOf,
  stepFolderOf,
  entityPartFolderOf,
  runnableLineOf,
  runGate,
  runPipeline,
  runEntityPipelines,
});
