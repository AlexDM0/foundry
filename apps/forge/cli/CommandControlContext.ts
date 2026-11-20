/**
 * The control contexts commands apply with: the setup messages in the Overseer's words, filled with this process's agent adapter's names of
 * its tools and files, and main's `CONSTITUTION.md` read on the repository's main line. They differ in the live Overseer: the command line
 * reads it from the newest Baton, while inside the Overseer no other Overseer owns the board.
 */
import type { PlatformPorts }                from '../src/lib/platform-ports/PlatformPortsFor.ts';
import { mainLineOf }                        from '../src/services/lifecycle/MergeTargets.ts';
import { Baton }                             from '../src/services/overseer/Baton.ts';
import { InstructionFiles }                  from '../src/services/overseer/InstructionFiles.ts';
import { overseerFilesIn }                   from '../src/services/overseer/OverseerFiles.ts';
import type { ControlContext, LiveOverseer } from '../src/shared/@types/ControlContext.ts';
import { agentAdapterOfThisProcess }         from './CommandContext.ts';
import { OverseerWording }                   from './overseer/OverseerWording.ts';

function controlContextWith(liveOverseerOf: ControlContext['liveOverseerOf']): ControlContext {
  return Object.freeze<ControlContext>({
    setupMessageWordingOf: (message) => OverseerWording.setupMessageWordingOf(message, agentAdapterOfThisProcess().promptFills),
    mainConstitutionOf:    (rootDirectory: string, constitutionPath?: string) => InstructionFiles.mainConstitutionOf(rootDirectory, mainLineOf(rootDirectory), constitutionPath),
    liveOverseerOf,
  });
}

function liveOverseerFromTheNewestBaton(platformPorts: PlatformPorts, dataFolder: string): LiveOverseer | null {
  const { overseerDirectory } = overseerFilesIn(dataFolder);
  const newestBaton           = Baton.newestBatonOf(platformPorts, overseerDirectory);
  if (newestBaton.verdict !== 'live') return null;
  return { url: newestBaton.record.url, batonFilePath: Baton.batonFilePathFor(overseerDirectory, newestBaton.generation) };
}

/** The command line's context, outside any Overseer. */
export function commandControlContextOf(platformPorts: PlatformPorts): ControlContext {
  return controlContextWith((dataFolder) => liveOverseerFromTheNewestBaton(platformPorts, dataFolder));
}

/** The context of the command endpoint and the Overseer's own writes, which apply in the live Overseer's hold. */
export const INSIDE_THE_OVERSEER_CONTROL_CONTEXT: ControlContext = controlContextWith(() => null);
