/**
 * A pipeline agent's proposed prepare steps and gates, run twice on the main-line snapshot before User sees them, each gate on its own so one
 * red gate never hides the next: what a gate did both times is its verdict, `disagreeing` when the two runs differ.
 */
import type { SupervisedSpawnOptions }                        from '../../lib/process-identity/ProcessSupervision.ts';
import type { ShellLine }                                     from '../../lib/shell-line/ShellLine.ts';
import type { GateOutcome }                                   from '../../lib/tracker-model/@types/Job.ts';
import type { PipelineGate, PipelineStep }                    from '../../lib/tracker-model/@types/Pipeline.ts';
import { GateLineRun, type GateLinesRun, type SingleGateRun } from './GateLineRun.ts';
import type { GateLineConfiner }                              from './GateRun.ts';

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

async function runProposalTwice(request: ProposalRunRequest): Promise<ProposalRunRecord | ProposalRunRefusal> {
  const runs: GateLinesRun[] = [];
  for (let i = 0; i < PROPOSAL_RUN_COUNT; i += 1) {
    const run = await GateLineRun.runOnce({ ...request, grantsWrites: true });
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
