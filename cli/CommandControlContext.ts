/**
 * The control context every command line and API command applies with: the setup messages in the Overseer's words, and main's
 * `CONSTITUTION.md` read on the repository's main line.
 */
import { mainLineOf }          from '../src/services/lifecycle/MergeTargets.ts';
import { InstructionFiles }    from '../src/services/overseer/InstructionFiles.ts';
import type { ControlContext } from '../src/shared/@types/ControlContext.ts';
import { OverseerWording }     from './overseer/OverseerWording.ts';

export const COMMAND_CONTROL_CONTEXT: ControlContext = Object.freeze({
  setupMessageWordingOf: OverseerWording.setupMessageWordingOf,
  mainConstitutionOf:    (rootDirectory: string) => InstructionFiles.mainConstitutionOf(rootDirectory, mainLineOf(rootDirectory)),
});
