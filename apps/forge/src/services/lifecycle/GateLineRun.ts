/**
 * One run of prepare steps and gates on a checkout, each gate judged on its own so one red gate never hides the next: a proposal's twice
 * run and a gate profile share it. A gate that changed the checkout fails, and the change is undone before the next gate.
 */
import { GitProcess }                      from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                    from '../../lib/git/GitWorktrees.ts';
import type { SupervisedSpawnOptions }     from '../../lib/process-identity/ProcessSupervision.ts';
import type { ShellLine }                  from '../../lib/shell-line/ShellLine.ts';
import type { GateOutcome }                from '../../lib/tracker-model/@types/Job.ts';
import type { PipelineGate, PipelineStep } from '../../lib/tracker-model/@types/Pipeline.ts';
import {
  GateRun,
  type GateConfinement,
  type GateLineConfiner,
  type GateProcessRun
} from './GateRun.ts';

export interface GateLineRequest {
  shellLine:      ShellLine;
  environment:    Readonly<Record<string, string>>;
  spawnOptions:   SupervisedSpawnOptions;
  confinedLineOf: GateLineConfiner;
  /** Told each line's process id once it started, so the caller can stop its tree. */
  onSpawned?:     (processId: number) => void;
  /** Told each piece of each line's output as it arrives. */
  onOutput?:      (text: string) => void;
}

export interface GateLineRunRequest extends GateLineRequest {
  prepare:         readonly PipelineStep[];
  gates:           readonly PipelineGate[];
  /** The checkout the lines judge, which a gate may never leave changed; a line runs in the project's folder of it. */
  directory:       string;
  /** The tracker's project folder below the checkout's root, `/`-separated; absent for a tracker at its repository's root. */
  projectPrefix?:  string;
  /** A clock exception: a duration is only recorded and shown, never deciding a pass. */
  millisecondsNow: () => number;
  /** False keeps every line to its checkout and the temporary folder: the gates' `writes` folders are not granted. */
  grantsWrites:    boolean;
}

/** A line the confinement port refused: nothing of the run judged the checkout. */
export interface GateLineRefusal {
  verdict: 'sandbox-unavailable';
  reason:  string;
}

export interface SingleGateRun {
  outcome:      GateOutcome;
  milliseconds: number;
  output:       string;
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

async function runLine(request: GateLineRequest, storedLine: string, directory: string, confinement: GateConfinement): Promise<GateProcessRun | GateLineRefusal> {
  const statusFile = GateRun.lineStatusFileOf();
  const line = GateRun.runnableLineOf(request, storedLine, { directory, statusFile }, confinement);
  if (line.verdict === 'refused') return { verdict: 'sandbox-unavailable', reason: line.reason };
  return GateRun.runGate({
    argv:              line.argv,
    verbatimArguments: line.verbatimArguments,
    statusFile,
    directory,
    environment:       request.environment,
    spawnOptions:      request.spawnOptions,
    ...(request.onSpawned === undefined ? {} : { onSpawned: request.onSpawned }),
    ...(request.onOutput === undefined ? {} : { onOutput: request.onOutput }),
  });
}

/**
 * A run whose prepare failed judges no gate: each gate of it is recorded `cannot-run` with the prepare's output. A prepare step that changed a
 * tracked file failed too, with its diff as the output, and the change is undone.
 */
async function runOnce(request: GateLineRunRequest): Promise<GateLinesRun | GateLineRefusal> {
  const prepareConfinement = GateRun.prepareConfinementOf(request.gates);
  for (const step of request.prepare) {
    const stepDirectory = GateRun.gateDirectoryOf(request.directory, step, request.projectPrefix);
    const run = await runLine(request, step.run, stepDirectory, request.grantsWrites ? prepareConfinement : withoutWrites(prepareConfinement));
    if ('verdict' in run) return run;
    const failureOutput = GateRun.prepareFailureOutputOf(request.shellLine, run, request.directory);
    if (failureOutput === null) continue;
    if (request.shellLine.exitMeaningOf(run) === 'passed') restoreCheckout(request.directory);
    return { failedStep: step.name, prepareOutput: failureOutput, gates: request.gates.map(() => ({ outcome: 'cannot-run', milliseconds: 0, output: failureOutput })) };
  }
  const gates: SingleGateRun[] = [];
  for (const gate of request.gates) {
    const confinement = GateRun.gateConfinementOf(gate);
    const startedAt = request.millisecondsNow();
    const gateDirectory = GateRun.gateDirectoryOf(request.directory, gate, request.projectPrefix);
    const run = await runLine(request, gate.run, gateDirectory, request.grantsWrites ? confinement : withoutWrites(confinement));
    if ('verdict' in run) return run;
    const milliseconds = request.millisecondsNow() - startedAt;
    const trackedChanges = GateRun.trackedChangesOf(request.directory);
    if (trackedChanges !== '') restoreCheckout(request.directory);
    gates.push({ outcome: GateRun.gateOutcomeOf(request.shellLine, run, trackedChanges), milliseconds, output: GateRun.gateErrorOutputOf(request.shellLine, run, trackedChanges) });
  }
  return { failedStep: null, prepareOutput: '', gates };
}

export const GateLineRun = Object.freeze({ runLine, runOnce });
