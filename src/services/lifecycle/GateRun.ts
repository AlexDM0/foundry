/**
 * The gate pipeline run on a tree, the code the Overseer's build, review and merge gates share: the prepare steps, then each gate of the
 * phase in its run order, the first red one stopping the rest. Each argv arrives built and confined by the caller; a step runs under the
 * port's spawn options with the job variables removed from its environment. agent-progress keeps no gate result: caching is the
 * repository's own tooling's.
 */
import { randomUUID }           from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir }               from 'node:os';
import { join }                 from 'node:path';

import type { ConfinedLine }                         from '../../lib/gate-confinement/ConfinedLine.ts';
import { GitProcess }                                from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                              from '../../lib/git/GitWorktrees.ts';
import type { SupervisedSpawnOptions }               from '../../lib/process-identity/ProcessSupervision.ts';
import type { ShellLine, ShellRunRefusal }           from '../../lib/shell-line/ShellLine.ts';
import type { GateOutcome }                          from '../../lib/tracker-model/@types/Job.ts';
import type { PipelineGate, PipelineStep }           from '../../lib/tracker-model/@types/Pipeline.ts';
import { JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE } from '../../shared/Environment.ts';

export interface GateRequest {
  argv:               readonly string[];
  /** The shell line's answer, handed to the spawn so a Windows line reaches cmd.exe unquoted; absent reads as `false`. */
  verbatimArguments?: boolean;
  /** Where the line may record its whole status, read back after the exit and removed; absent, no status is read, so none can pass. */
  statusFile?:        string;
  directory:          string;
  /** The whole child environment, already narrowed (`launchEnvironmentOf`); the job variables are removed from it. */
  environment:        Readonly<Record<string, string>>;
  /** The port's answer for a `gate`. */
  spawnOptions:       SupervisedSpawnOptions;
}

export interface GateProcessRun {
  /** `null` when the gate could not be started, or ended by a signal. */
  exitCode:       number | null;
  signalCode:     string | null;
  /** The status file's text, `null` when the line wrote none. */
  recordedStatus: string | null;
  output:         string;
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
  /** The checkout of the tree the pipeline judges; a gate's `in` is relative to it. */
  directory:        string;
  environment:      Readonly<Record<string, string>>;
  spawnOptions:     SupervisedSpawnOptions;
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

const LINE_STATUS_FILE_PREFIX = 'line-status-';

/** Without this, every spec of a gated tree that runs a mutating verb would Hatch it to the Overseer rather than run it. */
function gateEnvironmentOf(environment: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !JOB_VARIABLES.includes(name)));
}

/** A fresh path in the temporary folder for one line's status; nothing is created until the line writes it. */
function lineStatusFileOf(): string {
  return join(tmpdir(), `${LINE_STATUS_FILE_PREFIX}${randomUUID()}`);
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

async function runGate({
  argv, verbatimArguments, statusFile, directory, environment, spawnOptions
}: GateRequest): Promise<GateProcessRun> {
  try {
    const gateProcess = Bun.spawn({
      cmd:                      [...argv],
      cwd:                      directory,
      env:                      gateEnvironmentOf(environment),
      stdin:                    'ignore',
      stdout:                   'pipe',
      stderr:                   'pipe',
      windowsVerbatimArguments: verbatimArguments === true,
      ...spawnOptions,
    });
    const [output, errorOutput, exitCode] = await Promise.all([
      new Response(gateProcess.stdout).text(),
      new Response(gateProcess.stderr).text(),
      gateProcess.exited,
    ]);
    const signalCode = gateProcess.signalCode ?? null;
    return {
      exitCode: signalCode === null ? exitCode : null, signalCode, recordedStatus: statusFile === undefined ? null : recordedStatusOf(statusFile), output: output + errorOutput
    };
  } catch (error) {
    return {
      exitCode: null, signalCode: null, recordedStatus: null, output: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (statusFile !== undefined) rmSync(statusFile, { force: true });
  }
}

/** The diff of every tracked file a step changed against HEAD; empty when the tree is as it was. */
function trackedChangesOf(directory: string): string {
  const run = GitProcess.run(directory, ['diff', '--no-ext-diff', 'HEAD', '--'], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
  return GitProcess.succeeded(run) ? run.standardOutput : '';
}

/** A gate passes only when it exits 0 and leaves the tree unchanged. */
function gateOutcomeOf(shellLine: ShellLine, run: GateProcessRun, trackedChanges = ''): GateOutcome {
  const exitMeaning = shellLine.exitMeaningOf(run);
  if (exitMeaning === 'cannot-run') return 'cannot-run';
  return exitMeaning === 'passed' && trackedChanges === '' ? 'passed' : 'failed';
}

/** A gate that passed but changed the tree reports the diff; any other run its own output. */
function gateErrorOutputOf(shellLine: ShellLine, run: GateProcessRun, trackedChanges: string): string {
  return shellLine.exitMeaningOf(run) === 'passed' && trackedChanges !== '' ? trackedChanges : run.output;
}

function gateDirectoryOf(directory: string, gate: Readonly<PipelineGate>): string {
  return gate.in === undefined ? directory : join(directory, gate.in);
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
 * A prepare step that does not pass is a setup failure, never a red gate; the Overseer never runs a gate's `fix`. A phase with no gates
 * passes at once: its prepare steps would prepare for nothing.
 */
async function runPipeline(request: PipelineRunRequest): Promise<PipelineVerdict> {
  if (request.gates.length === 0) return { outcome: 'passed', gatesRun: [] };
  const prepareConfinement = prepareConfinementOf(request.gates);
  const { shellLine, environment, spawnOptions } = request;
  for (const step of request.prepare) {
    const statusFile = lineStatusFileOf();
    const line = runnableLineOf(request, step.run, { directory: request.directory, statusFile }, prepareConfinement);
    if (line.verdict === 'refused') return {
      outcome: 'sandbox-unavailable', step: step.name, output: line.reason, gatesRun: []
    };
    const run = await runGate({
      argv: line.argv, verbatimArguments: line.verbatimArguments, statusFile, directory: request.directory, environment, spawnOptions
    });
    if (shellLine.exitMeaningOf(run) !== 'passed') return {
      outcome: 'setup-failed', step: step.name, output: run.output, gatesRun: []
    };
  }
  const gatesRun: string[] = [];
  for (const gate of request.gates) {
    const statusFile = lineStatusFileOf();
    const directory = gateDirectoryOf(request.directory, gate);
    const line = runnableLineOf(request, gate.run, { directory, statusFile }, gateConfinementOf(gate));
    if (line.verdict === 'refused') return {
      outcome: 'sandbox-unavailable', step: gate.name, output: line.reason, gatesRun
    };
    const releaseGateSlot = request.acquireGateSlot === undefined ? null : await request.acquireGateSlot();
    let run: GateProcessRun;
    try {
      gatesRun.push(gate.name);
      run = await runGate({
        argv: line.argv, verbatimArguments: line.verbatimArguments, statusFile, directory, environment, spawnOptions
      });
    } finally {
      releaseGateSlot?.();
    }
    const trackedChanges = trackedChangesOf(request.directory);
    const outcome = gateOutcomeOf(shellLine, run, trackedChanges);
    if (outcome !== 'passed') return {
      outcome, gate: gate.name, output: gateErrorOutputOf(shellLine, run, trackedChanges), gatesRun
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
  lineStatusFileOf,
  recordedStatusOf,
  runRefusalReasonOf,
  runnableLineOf,
  runGate,
  runPipeline,
});
