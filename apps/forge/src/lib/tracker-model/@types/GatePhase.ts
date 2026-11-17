/**
 * The phases a pipeline runs gates in. Its own file, since a row records the phase of its green and the pipeline types reach the ticket
 * types, which reach the row's.
 */

/** Build is what a builder passes to be reviewed, review what a reviewer keeps green, merge what runs after main is merged in. */
export type GatePhase = 'build' | 'review' | 'merge';

/** The phases in the order a ticket meets them. */
export const GATE_PHASES: readonly GatePhase[] = Object.freeze(['build', 'review', 'merge']);

/** What a gate run judged a tree by: its phase, and the hash of that phase's prepare steps and gates as the run read them at its start. */
export interface GateRunStamp {
  phase:              GatePhase;
  phaseHash:          string;
  /** On a pipeline with entities: the phase hash of each entity whose gates ran, by entity key. Absent on a pipeline without entities. */
  entityPhaseHashes?: Readonly<Record<string, string>>;
}
