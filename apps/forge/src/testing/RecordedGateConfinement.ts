/**
 * The gate confinement of a default spec: it answers what the native confinement said of the machine when
 * `src/testing/RecordedGateLines.confinement.integration.spec.ts` recorded it, so no default spec probes the real sandbox.
 */
import type { ConfinementAvailability, ConfinementVerdict, GateConfinement } from '../lib/gate-confinement/GateConfinement.ts';
import { CONFINEMENT_CALL_SHAPES, GATE_LINE_BOUNDARIES, recordedAnswerOf }   from './RecordedGateLines.ts';

/** `unansweredError` notes a call the recording does not answer and returns the error it throws; a default spec runs no confined line. */
export function recordedGateConfinement(unansweredError: (call: string, reason: string) => Error): GateConfinement {
  return Object.freeze({
    availability:      () => recordedAnswerOf(GATE_LINE_BOUNDARIES.GATE_CONFINEMENT, CONFINEMENT_CALL_SHAPES.AVAILABILITY) as ConfinementAvailability,
    workerConfinement: () => recordedAnswerOf(GATE_LINE_BOUNDARIES.GATE_CONFINEMENT, CONFINEMENT_CALL_SHAPES.WORKER_CONFINEMENT) as ConfinementVerdict,
    confinedArgvOf:    () => {
      throw unansweredError('confinedArgvOf()', 'a default spec confines through `recordedGateConfiner` or `fakeGateConfinement`');
    },
  });
}
