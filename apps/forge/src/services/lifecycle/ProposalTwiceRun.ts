/**
 * The draft's prepare steps and the gates User asked to check, run twice on a checkout of main, each gate on its own so one red gate never
 * hides the next: what a gate did both times is its verdict, `disagreeing` when the two runs differ.
 */
import type { GateOutcome } from '../../lib/tracker-model/@types/Job.ts';
import {
  GateLineRun,
  type GateLineRunRequest,
  type GateLinesRun,
  type SingleGateRun
} from './GateLineRun.ts';

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

export interface ProposalRunRequest extends GateLineRunRequest {
  /** The main commit the checkout holds, which the record names. */
  snapshotCommit: string;
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
    const run = await GateLineRun.runOnce(request);
    if ('verdict' in run) return run;
    runs.push(run);
  }
  const prepareOutput = runs.map((run) => run.prepareOutput).filter((output) => output !== '').at(-1) ?? '';
  return {
    snapshotCommit: request.snapshotCommit,
    prepare:        { failedSteps: runs.map((run) => run.failedStep), output: prepareOutput },
    gates:          request.gates.map((gate, index) => {
      const ofGate = runs.map((run): SingleGateRun => run.gates[index] ?? {
        outcome: 'cannot-run', milliseconds: 0, cacheReport: null, output: ''
      });
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
