/**
 * The control contexts commands apply with: the setup messages in Hephaestus's words, filled with this process's agent adapter's names of
 * its tools and files, and main's `CONSTITUTION.md` read on the repository's main line. They differ in the live Hephaestus: the command line
 * reads it from the newest Baton, while inside Hephaestus no other Hephaestus owns the board.
 */
import type { PlatformPorts }                  from '../src/lib/platform-ports/PlatformPortsFor.ts';
import { Baton }                               from '../src/services/hephaestus/Baton.ts';
import { hephaestusFilesIn }                   from '../src/services/hephaestus/HephaestusFiles.ts';
import { InstructionFiles }                    from '../src/services/hephaestus/InstructionFiles.ts';
import { mainLineOf }                          from '../src/services/lifecycle/MergeTargets.ts';
import type { ControlContext, LiveHephaestus } from '../src/shared/@types/ControlContext.ts';
import { agentAdapterOfThisProcess }           from './CommandContext.ts';
import { HephaestusWording }                   from './hephaestus/HephaestusWording.ts';

function controlContextWith(liveHephaestusOf: ControlContext['liveHephaestusOf']): ControlContext {
  return Object.freeze<ControlContext>({
    setupMessageWordingOf: (message) => HephaestusWording.setupMessageWordingOf(message, agentAdapterOfThisProcess().promptFills),
    mainConstitutionOf:    (rootDirectory: string, constitutionPath?: string) => InstructionFiles.mainConstitutionOf(rootDirectory, mainLineOf(rootDirectory), constitutionPath),
    liveHephaestusOf,
  });
}

function liveHephaestusFromTheNewestBaton(platformPorts: PlatformPorts, dataFolder: string): LiveHephaestus | null {
  const { hephaestusDirectory } = hephaestusFilesIn(dataFolder);
  const newestBaton           = Baton.newestBatonOf(platformPorts, hephaestusDirectory);
  if (newestBaton.verdict !== 'live') return null;
  return { url: newestBaton.record.url, batonFilePath: Baton.batonFilePathFor(hephaestusDirectory, newestBaton.generation) };
}

/** The command line's context, outside any Hephaestus. */
export function commandControlContextOf(platformPorts: PlatformPorts): ControlContext {
  return controlContextWith((dataFolder) => liveHephaestusFromTheNewestBaton(platformPorts, dataFolder));
}

/** The context of the command endpoint and Hephaestus's own writes, which apply in the live Hephaestus's hold. */
export const INSIDE_HEPHAESTUS_CONTROL_CONTEXT: ControlContext = controlContextWith(() => null);
