/**
 * The control contexts commands apply with: the setup messages in Hephaestus's words, filled with this process's agent adapter's names of
 * its tools and files, main's `CONSTITUTION.md` read on the repository's main line, and the ways a vendor bills as that adapter names them.
 * They differ in the live Hephaestus: the command line reads it from the newest Hephaestus lock, while inside Hephaestus no other Hephaestus
 * owns the board.
 */
import type { AgentAdapter }                   from '../src/lib/agent-launch/AgentAdapter.ts';
import { AgentBillingUtil }                    from '../src/lib/agent-launch/utils/AgentBillingUtil.ts';
import type { PlatformPorts }                  from '../src/lib/platform-ports/PlatformPortsFor.ts';
import { hephaestusFilesIn }                   from '../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }                      from '../src/services/hephaestus/HephaestusLock.ts';
import { InstructionFiles }                    from '../src/services/hephaestus/InstructionFiles.ts';
import { mainLineOf }                          from '../src/services/lifecycle/MergeTargets.ts';
import type { ControlContext, LiveHephaestus } from '../src/shared/@types/ControlContext.ts';
import { agentAdapterOfThisProcess }           from './CommandContext.ts';
import { HephaestusWording }                   from './hephaestus/HephaestusWording.ts';

function controlContextWith(liveHephaestusOf: ControlContext['liveHephaestusOf'], agentAdapter: AgentAdapter): ControlContext {
  return Object.freeze<ControlContext>({
    setupMessageWordingOf: (message) => HephaestusWording.setupMessageWordingOf(message, agentAdapterOfThisProcess().promptFills),
    mainConstitutionOf:    (rootDirectory: string, constitutionPath?: string) => InstructionFiles.mainConstitutionOf(rootDirectory, mainLineOf(rootDirectory), constitutionPath),
    liveHephaestusOf,
    offeredBillingModesOf: (vendor: string) => AgentBillingUtil.offeredModesOf(agentAdapter, vendor),
  });
}

function liveHephaestusFromTheNewestHephaestusLock(platformPorts: PlatformPorts, dataFolder: string): LiveHephaestus | null {
  const { hephaestusDirectory } = hephaestusFilesIn(dataFolder);
  const newestLock           = HephaestusLock.newestOf(platformPorts, hephaestusDirectory);
  if (newestLock.verdict !== 'live') return null;
  return { url: newestLock.record.url, hephaestusLockFilePath: HephaestusLock.filePathFor(hephaestusDirectory, newestLock.generation) };
}

/** The command line's context, outside any Hephaestus. */
export function commandControlContextOf(platformPorts: PlatformPorts, agentAdapter: AgentAdapter): ControlContext {
  return controlContextWith((dataFolder) => liveHephaestusFromTheNewestHephaestusLock(platformPorts, dataFolder), agentAdapter);
}

/** The context of the command endpoint and Hephaestus's own writes, which apply in the live Hephaestus's hold. */
export function insideHephaestusControlContextOf(agentAdapter: AgentAdapter): ControlContext {
  return controlContextWith(() => null, agentAdapter);
}
