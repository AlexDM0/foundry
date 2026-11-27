/**
 * One run of prepare steps and gates on a checkout, each gate judged on its own so one red gate never hides the next: a proposal's twice
 * run and a gate profile share it. Each line runs under Talos in its own step folder of the run's child folder. A gate that changed the
 * checkout fails, and the change is undone before the next gate.
 */
import type { GateCacheReport, GateOutcome, PipelineStepRun } from '../../domain/tracker-model/@types/Job.ts';
import type { PipelineGate, PipelineStep }                    from '../../domain/tracker-model/@types/Pipeline.ts';
import { GitProcess }                                         from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                       from '../../lib/git/GitWorktrees.ts';
import type { ShellLine }                                     from '../../lib/shell-line/ShellLine.ts';
import type { LineRefusal }                                   from '../../shared/@types/LineRefusal.ts';
import {
  GateRun,
  type GateConfinement,
  type GateLineConfiner,
  type GateProcessRun,
  type LineRunner
} from './GateRun.ts';

export interface GateLineRequest {
  shellLine:      ShellLine;
  environment:    Readonly<Record<string, string>>;
  confinedLineOf: GateLineConfiner;
  runLine:        LineRunner;
  /** The run's folder under the board folder; each line runs in `prepare-<i>` or `gate-<i>` below it. */
  childFolder:    string;
  /** Told each line of each step's output as Talos records it. */
  onOutputLine?:  (line: string) => void;
}

export interface GateLineRunRequest extends GateLineRequest {
  prepare:        readonly PipelineStep[];
  gates:          readonly PipelineGate[];
  /** The checkout the lines judge, which a gate may never leave changed; a line runs in the project's folder of it. */
  directory:      string;
  /** The tracker's project folder below the checkout's root, `/`-separated; absent for a tracker at its repository's root. */
  projectPrefix?: string;
  /** False keeps every line to its checkout and the temporary folder: the gates' `writes` folders are not granted. */
  grantsWrites:   boolean;
}

/** A line the confinement port refused: nothing of the run judged the checkout. */
export interface GateLineRefusal {
  verdict: 'sandbox-unavailable';
  refusal: LineRefusal;
}

export interface SingleGateRun {
  outcome:            GateOutcome;
  /** The gate line's run time as Talos measured it, a sleep not counted. */
  milliseconds:       number;
  /** Talos stopped the line at its time bound. */
  stoppedAtTimeBound: boolean;
  /** What the gate reported at its report path; `null` when it reported nothing readable, or never ran. */
  cacheReport:        GateCacheReport | null;
  output:             string;
  /** The gate line's run as its `pipeline-step-ran` record keeps it; `null` when it never ran, as after a failed prepare step. */
  stepRun:            PipelineStepRun | null;
}

export interface GateLinesRun {
  /** The first prepare step that did not exit 0 or changed a tracked file, `null` where every one passed. */
  failedStep:    string | null;
  prepareOutput: string;
  gates:         SingleGateRun[];
}

function withoutWrites(confinement: GateConfinement): GateConfinement {
  return { ...confinement, writes: [] };
}

/** A gate that changed the checkout fails; the change is undone so the next gate judges the checkout as committed. */
function restoreCheckout(directory: string): void {
  GitProcess.run(directory, ['checkout', '-q', '--', '.'], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
}

/** A gate's line is handed a report path; a prepare step's is not, since a prepare step is no gate run. */
async function runLine(
  request: GateLineRequest,
  storedLine: string,
  place: { directory: string; childFolder: string },
  confinement: GateConfinement,
  lineKind: 'prepare-step' | 'gate' = 'prepare-step',
): Promise<GateProcessRun | GateLineRefusal> {
  const { directory, childFolder } = place;
  const statusFile = GateRun.lineStatusFileOf();
  const line = GateRun.runnableLineOf(request, storedLine, { directory, statusFile }, confinement);
  if (line.verdict === 'refused') return { verdict: 'sandbox-unavailable', refusal: line.refusal };
  return GateRun.runGate({
    argv:              line.argv,
    verbatimArguments: line.verbatimArguments,
    statusFile,
    ...(lineKind === 'gate' ? { reportFile: GateRun.gateReportFileOf() } : {}),
    directory,
    environment:       request.environment,
    runLine:           request.runLine,
    childFolder,
    ...(request.onOutputLine === undefined ? {} : { onOutputLine: request.onOutputLine }),
  });
}

/**
 * A run whose prepare failed judges no gate: each gate of it is recorded `cannot-run` with the prepare's output. A prepare step that changed a
 * tracked file failed too, with its diff as the output, and the change is undone.
 */
async function runOnce(request: GateLineRunRequest): Promise<GateLinesRun | GateLineRefusal> {
  const prepareConfinement = GateRun.prepareConfinementOf(request.gates);
  for (const [stepIndex, step] of request.prepare.entries()) {
    const place = {
      directory:   GateRun.gateDirectoryOf(request.directory, step, request.projectPrefix),
      childFolder: GateRun.stepFolderOf(request.childFolder, 'prepare', stepIndex),
    };
    const run = await runLine(request, step.run, place, request.grantsWrites ? prepareConfinement : withoutWrites(prepareConfinement));
    if ('verdict' in run) return run;
    const failureOutput = GateRun.prepareFailureOutputOf(request.shellLine, run, request.directory);
    if (failureOutput === null) continue;
    if (request.shellLine.exitMeaningOf(run) === 'passed') restoreCheckout(request.directory);
    return {
      failedStep:    step.name,
      prepareOutput: failureOutput,
      gates:         request.gates.map(() => ({
        outcome: 'cannot-run', milliseconds: 0, stoppedAtTimeBound: false, cacheReport: null, output: failureOutput, stepRun: null
      }))
    };
  }
  const gates: SingleGateRun[] = [];
  for (const [gateIndex, gate] of request.gates.entries()) {
    const confinement = GateRun.gateConfinementOf(gate);
    const place = {
      directory:   GateRun.gateDirectoryOf(request.directory, gate, request.projectPrefix),
      childFolder: GateRun.stepFolderOf(request.childFolder, 'gate', gateIndex),
    };
    const run = await runLine(request, gate.run, place, request.grantsWrites ? confinement : withoutWrites(confinement), 'gate');
    if ('verdict' in run) return run;
    const trackedChanges = GateRun.trackedChangesOf(request.directory);
    if (trackedChanges !== '') restoreCheckout(request.directory);
    const outcome = GateRun.gateOutcomeOf(request.shellLine, run, trackedChanges);
    gates.push({
      outcome,
      milliseconds:       run.runMilliseconds,
      stoppedAtTimeBound: run.endReason === 'time-bound',
      cacheReport:        run.cacheReport,
      output:             GateRun.gateErrorOutputOf(request.shellLine, run, trackedChanges),
      stepRun:            GateRun.stepRunsOf('gate', gate.name, run, outcome === 'passed')[0] ?? null,
    });
  }
  return { failedStep: null, prepareOutput: '', gates };
}

export const GateLineRun = Object.freeze({ runLine, runOnce });
