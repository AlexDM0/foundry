/**
 * The control context every command line and API command applies with: the setup messages in the Overseer's words, filled with this
 * process's agent adapter's names of its tools and files, and main's `CONSTITUTION.md` read on the repository's main line.
 */
import { mainLineOf }                from '../src/services/lifecycle/MergeTargets.ts';
import { InstructionFiles }          from '../src/services/overseer/InstructionFiles.ts';
import type { ControlContext }       from '../src/shared/@types/ControlContext.ts';
import { agentAdapterOfThisProcess } from './CommandContext.ts';
import { OverseerWording }           from './overseer/OverseerWording.ts';

export const COMMAND_CONTROL_CONTEXT: ControlContext = Object.freeze<ControlContext>({
  setupMessageWordingOf: (message) => OverseerWording.setupMessageWordingOf(message, agentAdapterOfThisProcess().promptFills),
  mainConstitutionOf:    (rootDirectory: string, constitutionPath?: string) => InstructionFiles.mainConstitutionOf(rootDirectory, mainLineOf(rootDirectory), constitutionPath),
});
