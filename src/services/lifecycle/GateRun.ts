/**
 * The gate pipeline run on a tree, the code the Overseer's build, review and merge gates share: the prepare steps, then each gate in list
 * order, the first red one stopping the rest. Each argv arrives built and confined by the caller; a step runs in a process group of its own
 * with the job variables removed from its environment. agent-progress keeps no gate result: caching is the repository's own tooling's.
 */
import { join } from 'node:path';

import type { ConfinedLine }                         from '../../lib/gate-confinement/ConfinedLine.ts';
import { GitProcess }                                from '../../lib/git/GitProcess.ts';
import type { ShellLine }                            from '../../lib/shell-line/ShellLine.ts';
import type { GateOutcome }                          from '../../lib/tracker-model/@types/Job.ts';
import type { PipelineGate, PipelineStep }           from '../../lib/tracker-model/@types/Pipeline.ts';
import { JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE } from '../../shared/Environment.ts';

export interface GateRequest {
  argv:        readonly string[];
  directory:   string;
  /** The whole child environment, already narrowed (`launchEnvironmentOf`); the job variables are removed from it. */
  environment: Readonly<Record<string, string>>;
}

export interface GateProcessRun {
  /** `null` when the gate could not be started, or ended by a signal. */
  exitCode:   number | null;
  signalCode: string | null;
  output:     string;
}

/** What one step may reach besides its tree and temp: the network when it names domains (a prepare step always), and the folders it writes. */
export interface GateConfinement {
  network:        boolean;
  networkDomains: readonly string[];
  writes:         readonly string[];
}

export interface PipelineRunRequest {
  shellLine:        ShellLine;
  prepare:          readonly PipelineStep[];
  gates:            readonly PipelineGate[];
  /** The checkout of the tree the pipeline judges; a gate's `in` is relative to it. */
  directory:        string;
  environment:      Readonly<Record<string, string>>;
  confinedLineOf:   GateLineConfiner;
  /** Waits for one of the machine's gate run slots and answers its release; prepare steps take none. */
  acquireGateSlot?: () => Promise<() => void>;
}

/** A step's argv in its confinement, or the refusal that keeps it from running. */
export type GateLineConfiner = (argv: readonly string[], confinement: GateConfinement) => ConfinedLine;

export type PipelineVerdict =
  | { outcome: 'setup-failed'; step: string; output: string; gatesRun: string[] }
  /** `output` is the port's reason; the step never started. */
  | { outcome: 'sandbox-unavailable'; step: string; output: string; gatesRun: string[] }
  | { outcome: 'passed'; gatesRun: string[] }
  | { outcome: Exclude<GateOutcome, 'passed'>; gate: string; output: string; gatesRun: string[] };

const JOB_VARIABLES: readonly string[] = [JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE];

const GATE_PASSED_EXIT_CODE = 0;

/** Without this, every spec of a gated tree that runs a mutating verb would Hatch it to the Overseer rather than run it. */
function gateEnvironmentOf(environment: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !JOB_VARIABLES.includes(name)));
}

async function runGate({ argv, directory, environment }: GateRequest): Promise<GateProcessRun> {
  try {
    const gateProcess = Bun.spawn({
      cmd:      [...argv],
      cwd:      directory,
      env:      gateEnvironmentOf(environment),
      // A process group of its own, so a checks line's `kill 0` reaches only the gate.
      detached: true,
      stdin:    'ignore',
      stdout:   'pipe',
      stderr:   'pipe',
    });
    const [output, errorOutput, exitCode] = await Promise.all([
      new Response(gateProcess.stdout).text(),
      new Response(gateProcess.stderr).text(),
      gateProcess.exited,
    ]);
    const signalCode = gateProcess.signalCode ?? null;
    return { exitCode: signalCode === null ? exitCode : null, signalCode, output: output + errorOutput };
  } catch (error) {
    return { exitCode: null, signalCode: null, output: error instanceof Error ? error.message : String(error) };
  }
}

/** The diff of every tracked file a step changed against HEAD; empty when the tree is as it was. */
function trackedChangesOf(directory: string): string {
  const run = GitProcess.run(directory, ['diff', '--no-ext-diff', 'HEAD', '--']);
  return GitProcess.succeeded(run) ? run.standardOutput : '';
}

/** A gate passes only when it exits 0 and leaves the tree unchanged. */
function gateOutcomeOf(shellLine: ShellLine, run: GateProcessRun, trackedChanges = ''): GateOutcome {
  const exitMeaning = shellLine.exitMeaningOf(run);
  if (exitMeaning === 'cannot-run') return 'cannot-run';
  return exitMeaning === 'passed' && trackedChanges === '' ? 'passed' : 'failed';
}

/** A gate that exited 0 but changed the tree reports the diff; any other run its own output. */
function gateErrorOutputOf(run: GateProcessRun, trackedChanges: string): string {
  return run.exitCode === GATE_PASSED_EXIT_CODE && trackedChanges !== '' ? trackedChanges : run.output;
}

function gateDirectoryOf(directory: string, gate: Readonly<PipelineGate>): string {
  return gate.in === undefined ? directory : join(directory, gate.in);
}

function gateConfinementOf(gate: Readonly<PipelineGate>): GateConfinement {
  const networkDomains = gate.network ?? [];
  return { network: networkDomains.length > 0, networkDomains, writes: gate.writes ?? [] };
}

/** A prepare step installs, so it reaches the network and writes every folder a gate may. */
function prepareConfinementOf(gates: readonly PipelineGate[]): GateConfinement {
  return { network: true, networkDomains: [], writes: [...new Set(gates.flatMap((gate) => gate.writes ?? []))] };
}

/** A prepare step that does not exit 0 is a setup failure, never a red gate; the Overseer never runs a gate's `fix`. */
async function runPipeline(request: PipelineRunRequest): Promise<PipelineVerdict> {
  const prepareConfinement = prepareConfinementOf(request.gates);
  const { shellLine, confinedLineOf, environment } = request;
  for (const step of request.prepare) {
    const line = confinedLineOf(shellLine.spawnRequestOf(step.run).argv, prepareConfinement);
    if (line.verdict === 'refused') return {
      outcome: 'sandbox-unavailable', step: step.name, output: line.reason, gatesRun: []
    };
    const run = await runGate({ argv: line.argv, directory: request.directory, environment });
    if (run.exitCode !== GATE_PASSED_EXIT_CODE) return {
      outcome: 'setup-failed', step: step.name, output: run.output, gatesRun: []
    };
  }
  const gatesRun: string[] = [];
  for (const gate of request.gates) {
    const line = confinedLineOf(shellLine.spawnRequestOf(gate.run).argv, gateConfinementOf(gate));
    if (line.verdict === 'refused') return {
      outcome: 'sandbox-unavailable', step: gate.name, output: line.reason, gatesRun
    };
    const releaseGateSlot = request.acquireGateSlot === undefined ? null : await request.acquireGateSlot();
    let run: GateProcessRun;
    try {
      gatesRun.push(gate.name);
      run = await runGate({ argv: line.argv, directory: gateDirectoryOf(request.directory, gate), environment });
    } finally {
      releaseGateSlot?.();
    }
    const trackedChanges = trackedChangesOf(request.directory);
    const outcome = gateOutcomeOf(shellLine, run, trackedChanges);
    if (outcome !== 'passed') return {
      outcome, gate: gate.name, output: gateErrorOutputOf(run, trackedChanges), gatesRun
    };
  }
  return { outcome: 'passed', gatesRun };
}

export const GateRun = Object.freeze({
  gateEnvironmentOf,
  gateOutcomeOf,
  gateErrorOutputOf,
  gateDirectoryOf,
  gateConfinementOf,
  prepareConfinementOf,
  trackedChangesOf,
  runGate,
  runPipeline,
});
