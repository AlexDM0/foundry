/** Synthetic readings of Flint's brain, as the Overseer reports them, for the header, Agents and Flint host specs. Test-only. */
import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';

export const OFF_FLINT_BRAIN: MonitorFlintBrainDocument = Object.freeze({
  state:       'off',
  startedAt:   null,
  endsAt:      null,
  startedBy:   null,
  model:       null,
  effort:      null,
  tokens:      null,
  calls:       null,
  recentMoves: [],
  endedAt:     null,
  endedReason: null,
  sentence:    null,
  refusal:     null,
});

/** A brain the Bridge started at `startedAt`, its two minutes ending at `endsAt`, with the tokens and calls of a few asks. */
export function runningFlintBrain(startedAt: string, endsAt: string): MonitorFlintBrainDocument {
  return {
    ...OFF_FLINT_BRAIN,
    state:     'running',
    startedAt,
    endsAt,
    startedBy: 'bridge',
    model:     'haiku',
    effort:    'low',
    tokens:    1200,
    calls:     3,
  };
}

export function exampleFlintBrain(changes: Partial<MonitorFlintBrainDocument>): MonitorFlintBrainDocument {
  return { ...OFF_FLINT_BRAIN, ...changes };
}
