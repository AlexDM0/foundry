/**
 * The facts of the forge's agent a view reads, from the Board, this machine's config and the places installers put programs: the choice,
 * the program it names now, whether that program ran since Hephaestus started, and the tools of the pipeline and of the open setup record.
 */
import { MachineConfigFile }      from '../../adapters/machine-config/MachineConfigFile.ts';
import type { AgentAdapter }      from '../../lib/agent-launch/AgentAdapter.ts';
import type { PlatformPorts }     from '../../lib/platform-ports/PlatformPortsFor.ts';
import { ProgramSearchUtil }      from '../../lib/program-folders/utils/ProgramSearchUtil.ts';
import type { Board }             from '../../lib/tracker-model/Board.ts';
import type { AgentFacts }        from '../../shared/@types/AgentFacts.ts';
import type { AgentProgramCheck } from '../../shared/@types/AgentProgramCheck.ts';
import { AgentPrograms }          from '../control/AgentPrograms.ts';
import { AgentTools }             from '../control/AgentTools.ts';
import { COMING_AGENT_VENDORS }   from './constants/ComingAgentVendors.ts';

export interface AgentFactsSource {
  board:         Pick<Board, 'agentOfForge' | 'pipeline' | 'pipelineSetup'>;
  adapter:       AgentAdapter;
  platformPorts: PlatformPorts;
  homeDirectory: string;
  monitorFolder: string;
  /** The newest run of a program this Hephaestus made, `null` for one it has not run yet; absent outside Hephaestus, where none runs. */
  checkOf?:      (programPath: string) => AgentProgramCheck | null;
}

/** A choice that names no program never runs, so it needs no run to say so. */
function checkOfChoice(source: AgentFactsSource, programPath: string | null): AgentProgramCheck | null {
  const choice = source.board.agentOfForge();
  if (choice === null) return null;
  if (choice.vendor !== source.adapter.vendor) return { verdict: 'does-not-run', programPath, cause: 'other-vendor' };
  if (programPath === null) return { verdict: 'does-not-run', programPath: null, cause: 'no-machine-program' };
  return source.checkOf?.(programPath) ?? null;
}

function agentFactsOf(source: AgentFactsSource): AgentFacts {
  const {
    board, adapter, platformPorts, homeDirectory
  } = source;
  const choice = board.agentOfForge();
  const vendor = choice?.vendor ?? adapter.vendor;
  const machineProgramPath = MachineConfigFile.programPathOf(MachineConfigFile.read(source.monitorFolder), vendor);
  const programPath = choice === null ? null : AgentPrograms.chosenPathOf(choice.program, machineProgramPath);
  const { executableResolver, programFolders, shellLine } = platformPorts;
  const toolSearch = ProgramSearchUtil.toolSearchOf(programFolders, homeDirectory);
  const pipeline = board.pipeline();
  const setup = board.pipelineSetup();
  return {
    vendors: [
      { vendor: adapter.vendor, displayName: adapter.displayName, supported: true },
      ...COMING_AGENT_VENDORS.filter((coming) => coming.vendor !== adapter.vendor).map((coming) => ({ ...coming, supported: false })),
    ],
    agentName:   adapter.displayName,
    choice,
    machineProgramPath,
    programPath,
    check:       checkOfChoice(source, programPath),
    places:      vendor === adapter.vendor ? AgentPrograms.placesOf(adapter, programFolders, homeDirectory, executableResolver) : [],
    toolsListed: pipeline?.tools !== undefined,
    tools:       AgentTools.toolFactsOf(pipeline, shellLine, toolSearch, executableResolver),
    setupTools:  setup === null ? [] : AgentTools.toolFactsOf(setup.draft ?? pipeline, shellLine, toolSearch, executableResolver),
  };
}

export const AgentFactsReading = Object.freeze({ agentFactsOf });
