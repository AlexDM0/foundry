/** A control context for specs: a setup message is worded as its own JSON, so a spec reads back the values the applier sent. */
import type { ControlContext, SetupMessage } from '../shared/@types/ControlContext.ts';

export const ECHOED_CONTROL_CONTEXT: ControlContext = Object.freeze({ setupMessageWordingOf: (message: SetupMessage) => JSON.stringify(message) });
