/** The control context every command line and API command applies with: the setup messages in the Overseer's words. */
import type { ControlContext } from '../src/shared/@types/ControlContext.ts';
import { OverseerWording }     from './overseer/OverseerWording.ts';

export const COMMAND_CONTROL_CONTEXT: ControlContext = Object.freeze({ setupMessageWordingOf: OverseerWording.setupMessageWordingOf });
