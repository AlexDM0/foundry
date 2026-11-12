/**
 * The phases a pipeline runs gates in. Its own file, since a row records the phase of its green and the pipeline types reach the ticket
 * types, which reach the row's.
 */

/** Build is what a builder passes to be reviewed, review what a reviewer keeps green, merge what runs after main is merged in. */
export type GatePhase = 'build' | 'review' | 'merge';

/** The phases in the order a ticket meets them. */
export const GATE_PHASES: readonly GatePhase[] = Object.freeze(['build', 'review', 'merge']);
