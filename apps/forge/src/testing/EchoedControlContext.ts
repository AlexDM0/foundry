/**
 * A control context for specs: a setup message is worded as its own JSON, so a spec reads back the values the applier sent, and main
 * holds no `CONSTITUTION.md` unless the spec gives a reading of its own; no Hephaestus is live; every vendor bills both ways.
 */
import type { MainConstitutionReading }      from '../lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlContext, SetupMessage } from '../shared/@types/ControlContext.ts';
import { EVERY_BILLING_MODE_OFFERED }        from './ExamplePipelineAgent.ts';

export const ECHOED_CONTROL_CONTEXT: ControlContext = Object.freeze({
  setupMessageWordingOf: (message: SetupMessage) => JSON.stringify(message),
  mainConstitutionOf:    (): MainConstitutionReading => ({ verdict: 'absent' }),
  liveHephaestusOf:      () => null,
  offeredBillingModesOf: EVERY_BILLING_MODE_OFFERED,
});

/** The echoed context with main's `CONSTITUTION.md` read as `reading`. */
export function echoedControlContextWith(reading: MainConstitutionReading): ControlContext {
  return Object.freeze({ ...ECHOED_CONTROL_CONTEXT, mainConstitutionOf: () => reading });
}
