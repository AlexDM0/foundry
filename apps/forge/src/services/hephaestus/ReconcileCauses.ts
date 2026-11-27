/**
 * What a start's kind makes of the work it finds cut short: the cause of a job whose child is gone with no end of its own, and whether the
 * Airlock slots it finds with no live holder are held for User's resume instead of requeued.
 */
import type { InterruptionCause, StartKind } from '../../domain/tracker-model/@types/Job.ts';

/** `null`: a child lost in a handover or before a first start keeps the cause the lost Talos's sweep settled for it. */
const CAUSE_OF_A_GONE_CHILD_BY_START_KIND: Readonly<Record<StartKind, InterruptionCause | null>> = Object.freeze({
  'first-start':        null,
  'handover':           null,
  'stopped-on-purpose': 'forge-stopped',
  // A crash suspected before a reboot is this kind too: the machine did go down.
  'machine-went-down':  'reboot',
  'crashed':            'forge-crashed',
});

function causeOfAGoneChild(kind: StartKind): InterruptionCause | null {
  return CAUSE_OF_A_GONE_CHILD_BY_START_KIND[kind];
}

function startLeavesWorkWaiting(kind: StartKind): boolean {
  return causeOfAGoneChild(kind) !== null;
}

export const ReconcileCauses = Object.freeze({ causeOfAGoneChild, startLeavesWorkWaiting });
