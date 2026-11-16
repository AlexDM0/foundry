import type { MonitorFlintBrainEndedReason, MonitorFlintBrainStartedBy } from 'forge-contracts/MonitorSnapshotDocument';

/** `no-flint` where this forge cannot run the brain confined; the others refuse one start or stop. */
export type FlintBrainRefusal =
  | { readonly code: 'no-flint' | 'brain-already-running' | 'brain-not-running' | 'overseer-paused' | 'brain-failed-to-start' }
  | { readonly code: 'usage-limit-holds'; readonly resetsAt: string };

export type FlintBrainRefusalCode = FlintBrainRefusal['code'];

/** One brain run that ended, as the log keeps it: its tokens and model calls in total. */
export interface FlintBrainEndedRun {
  readonly startedBy:   MonitorFlintBrainStartedBy;
  readonly startedAt:   string;
  readonly endedAt:     string;
  readonly endedReason: MonitorFlintBrainEndedReason;
  readonly tokens:      number;
  readonly calls:       number;
}
