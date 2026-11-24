/** What a command about the forge's agent is prepared with on this process: its adapter, its ports, its environment and its run of a program. */
import { runProgramCheck }                          from '../src/lib/program-check/ProgramCheck.ts';
import type { AgentCommandPreparationContext }      from '../src/services/control/AgentCommandPreparation.ts';
import { AgentTools, type ToolNamingSteps }         from '../src/services/control/AgentTools.ts';
import type { StoreReadFace }                       from '../src/services/store/BoardStore.ts';
import { projectLocationOf }                        from '../src/services/tracker/ProjectLocation.ts';
import { agentToolForbiddenRootsOf }                from '../src/services/tracker/RegisteredRepositoryRoots.ts';
import type { AgentProgramCheck }                   from '../src/shared/@types/AgentProgramCheck.ts';
import { environmentCopy }                          from '../src/shared/Environment.ts';
import { AGENT_PROGRAM_CHECK_TIMEOUT_MILLISECONDS } from '../src/shared/constants/HephaestusLimits.ts';
import type { CommandContext }                      from './CommandContext.ts';

/** The forge a command is for: the roots its program and its tools may not lie in, and the pipeline whose tools a run of its program gets. */
export interface PreparedForge {
  readonly programForbiddenRoots: readonly string[];
  readonly toolForbiddenRoots:    readonly string[];
  readonly pipelineNow:           () => Readonly<ToolNamingSteps> | null;
}

/** A program the forge at `rootDirectory` runs may not lie in its repository; its tools in no registered repository and not in its worktrees. */
export function preparedForgeAt(context: CommandContext, rootDirectory: string, reads: Pick<StoreReadFace, 'readPipeline'>): PreparedForge {
  return {
    programForbiddenRoots: [projectLocationOf(rootDirectory).repositoryRoot],
    toolForbiddenRoots:    agentToolForbiddenRootsOf(rootDirectory, context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory)),
    pipelineNow:           () => {
      const reading = reads.readPipeline();
      return reading.verdict === 'readable' ? reading.pipeline : null;
    },
  };
}

export function agentCommandPreparationContextOf(
  context: CommandContext,
  forge: PreparedForge,
  recordCheck?: (check: AgentProgramCheck) => void,
): AgentCommandPreparationContext {
  const { platformPorts, homeDirectory } = context;
  const toolPlaces = AgentTools.toolPlacesOf(platformPorts, homeDirectory, forge.toolForbiddenRoots);
  return {
    check: {
      adapter:              context.agentAdapter,
      resolver:             platformPorts.executableResolver,
      forbiddenRoots:       forge.programForbiddenRoots,
      toolFolders:          () => AgentTools.toolFoldersOf(AgentTools.launchToolsOf(forge.pipelineNow(), toolPlaces).tools),
      launchEnvironment:    platformPorts.launchEnvironment,
      inheritedEnvironment: environmentCopy(),
      run:                  context.programCheckRun ?? runProgramCheck,
      timeoutMilliseconds:  AGENT_PROGRAM_CHECK_TIMEOUT_MILLISECONDS,
    },
    monitorFolder:      platformPorts.dataFolders.monitorFolderOf(homeDirectory),
    toolSearch:         toolPlaces.search,
    toolForbiddenRoots: forge.toolForbiddenRoots,
    ...(recordCheck === undefined ? {} : { recordCheck }),
  };
}
