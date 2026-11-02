/**
 * An onboarder's proposed prepare steps and gates, run twice on the main-line snapshot before User sees them, each gate on its own so one
 * red gate never hides the next: what a gate did both times is its verdict, `disagreeing` when the two runs differ.
 */
import { GitProcess }                      from '../../lib/git/GitProcess.ts';
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

export type ProposedGateVerdict = 'green' | 'red' | 'cannot-run' | 'disagreeing';

export interface ProposedGateRecord {
  name:                  string;
  outcomes:              GateOutcome[];
  durationsMilliseconds: number[];
  verdict:               ProposedGateVerdict;
  /** The last red or unrunnable run's output; empty when both passed. */
  output:                string;
}

export interface ProposedPrepareRecord {
  /** The first prepare step that did not exit 0 in each run, `null` where every one did. */
  failedSteps: (string | null)[];
  output:      string;
}

export interface ProposalRunRecord {
  snapshotCommit: string;
  prepare:        ProposedPrepareRecord;
  gates:          ProposedGateRecord[];
}

export interface ProposalRunRequest {
  shellLine:       ShellLine;
  prepare:         readonly PipelineStep[];
  gates:           readonly PipelineGate[];
  /** The detached main-line snapshot, which a gate may never leave changed. */
  directory:       string;
  snapshotCommit:  string;
  /** A clock exception: a duration is only recorded and shown, and the caching check suggests from it, never deciding a pass. */
  millisecondsNow: () => number;
  environment:     Readonly<Record<string, string>>;
  spawnOptions:    SupervisedSpawnOptions;
  confinedLineOf:  GateLineConfiner;
}

/** A line the confinement port refused: nothing of the proposal judged the snapshot, so no record exists. */
export interface ProposalRunRefusal {
  verdict: 'sandbox-unavailable';
  reason:  string;
}

export const PROPOSAL_RUN_COUNT = 2;

function verdictOf(outcomes: readonly GateOutcome[]): ProposedGateVerdict {
  if (outcomes.includes('cannot-run')) return 'cannot-run';
  if (new Set(outcomes).size > 1) return 'disagreeing';
  return outcomes[0] === 'passed' ? 'green' : 'red';
}

/** A gate that changed the snapshot fails; the change is undone so the next gate judges the snapshot as committed. */
function restoreSnapshot(directory: string): void {
  GitProcess.run(directory, ['checkout', '-q', '--', '.']);
}

interface SingleGateRun {
  outcome:      GateOutcome;
  milliseconds: number;
  output:       string;
}

interface SingleProposalRun {
  failedStep:    string | null;
  prepareOutput: string;
  gates:         SingleGateRun[];
}

async function runLine(request: ProposalRunRequest, storedLine: string, directory: string, confinement: GateConfinement): Promise<GateProcessRun | ProposalRunRefusal> {
  const statusFile = GateRun.lineStatusFileOf();
  const line = GateRun.runnableLineOf(request, storedLine, { directory, statusFile }, confinement);
  if (line.verdict === 'refused') return { verdict: 'sandbox-unavailable', reason: line.reason };
  return GateRun.runGate({
    argv: line.argv, verbatimArguments: line.verbatimArguments, statusFile, directory, environment: request.environment, spawnOptions: request.spawnOptions
  });
}

/** A run whose prepare failed judges no gate: each gate of it is recorded `cannot-run` with the prepare's output. */
async function runOnce(request: ProposalRunRequest): Promise<SingleProposalRun | ProposalRunRefusal> {
  for (const step of request.prepare) {
    const run = await runLine(request, step.run, request.directory, GateRun.prepareConfinementOf(request.gates));
    if ('verdict' in run) return run;
    if (request.shellLine.exitMeaningOf(run) === 'passed') continue;
    return { failedStep: step.name, prepareOutput: run.output, gates: request.gates.map(() => ({ outcome: 'cannot-run', milliseconds: 0, output: run.output })) };
  }
  const gates: SingleGateRun[] = [];
  for (const gate of request.gates) {
    const startedAt = request.millisecondsNow();
    const run = await runLine(request, gate.run, GateRun.gateDirectoryOf(request.directory, gate), GateRun.gateConfinementOf(gate));
    if ('verdict' in run) return run;
    const milliseconds = request.millisecondsNow() - startedAt;
    const trackedChanges = GateRun.trackedChangesOf(request.directory);
    if (trackedChanges !== '') restoreSnapshot(request.directory);
    gates.push({ outcome: GateRun.gateOutcomeOf(request.shellLine, run, trackedChanges), milliseconds, output: GateRun.gateErrorOutputOf(request.shellLine, run, trackedChanges) });
  }
  return { failedStep: null, prepareOutput: '', gates };
}

async function runProposalTwice(request: ProposalRunRequest): Promise<ProposalRunRecord | ProposalRunRefusal> {
  const runs: SingleProposalRun[] = [];
  for (let i = 0; i < PROPOSAL_RUN_COUNT; i += 1) {
    const run = await runOnce(request);
    if ('verdict' in run) return run;
    runs.push(run);
  }
  const prepareOutput = runs.map((run) => run.prepareOutput).filter((output) => output !== '').at(-1) ?? '';
  return {
    snapshotCommit: request.snapshotCommit,
    prepare:        { failedSteps: runs.map((run) => run.failedStep), output: prepareOutput },
    gates:          request.gates.map((gate, index) => {
      const ofGate = runs.map((run): SingleGateRun => run.gates[index] ?? { outcome: 'cannot-run', milliseconds: 0, output: '' });
      return {
        name:                  gate.name,
        outcomes:              ofGate.map((run) => run.outcome),
        durationsMilliseconds: ofGate.map((run) => run.milliseconds),
        verdict:               verdictOf(ofGate.map((run) => run.outcome)),
        output:                ofGate.filter((run) => run.outcome !== 'passed').at(-1)?.output ?? '',
      };
    }),
  };
}

export const ProposalTwiceRun = Object.freeze({ runProposalTwice, verdictOf });
