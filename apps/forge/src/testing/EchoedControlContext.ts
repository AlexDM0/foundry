/**
 * A control context for specs: a setup message is worded as its own JSON, so a spec reads back the values the applier sent, and main
 * holds no `CONSTITUTION.md` unless the spec gives a reading of its own; no Overseer is live.
 */
import type { MainConstitutionReading }      from '../lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlContext, SetupMessage } from '../shared/@types/ControlContext.ts';

export const ECHOED_CONTROL_CONTEXT: ControlContext = Object.freeze({
  setupMessageWordingOf: (message: SetupMessage) => JSON.stringify(message),
  mainConstitutionOf:    (): MainConstitutionReading => ({ verdict: 'absent' }),
  liveOverseerOf:        () => null,
});

/** The echoed context with main's `CONSTITUTION.md` read as `reading`. */
export function echoedControlContextWith(reading: MainConstitutionReading): ControlContext {
  return Object.freeze({ ...ECHOED_CONTROL_CONTEXT, mainConstitutionOf: () => reading });
}
