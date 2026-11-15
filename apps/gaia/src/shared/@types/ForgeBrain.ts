/**
 * A forge's Flint brain as its forge last reported it (PLAN 6.1). The forge runs it and words it; Gaia shows it, and a fact the forge did
 * not report is `null`. `'not-reported'` stands for a forge whose monitor is older than contract 3 or that has no Flint.
 */
export type BrainState = 'off' | 'starting' | 'running' | 'ended' | 'refused';

export type BrainStartedBy = 'bridge' | 'api';

export type BrainEndedReason = 'time' | 'stopped' | 'usage-limit' | 'failed';

/** A move the brain chose, in the forge's own literals. */
export interface BrainMove {
  at:     string;
  intent: string;
  emote:  string | null;
}

export interface BrainRefusal {
  code:     string;
  sentence: string;
}

export interface ForgeBrain {
  state:       BrainState;
  startedAt:   string | null;
  /** The forge's own end of the run: shown and counted down to, never compared (PLAN B6). */
  endsAt:      string | null;
  startedBy:   BrainStartedBy | null;
  model:       string | null;
  effort:      string | null;
  tokens:      number | null;
  calls:       number | null;
  /** Newest first. */
  recentMoves: BrainMove[];
  endedAt:     string | null;
  endedReason: BrainEndedReason | null;
  /** The forge's own words for the current state. */
  sentence:    string | null;
  refusal:     BrainRefusal | null;
}

export type ForgeBrainReading = ForgeBrain | 'not-reported';
