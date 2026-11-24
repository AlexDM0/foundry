/** What a command about the forge's agent is prepared with on this process: its adapter, its ports, its environment and its run of a program. */
import { runProgramCheck }                          from '../src/lib/program-check/ProgramCheck.ts';
import { ProgramSearchUtil }                        from '../src/lib/program-folders/utils/ProgramSearchUtil.ts';
import type { AgentCommandPreparationContext }      from '../src/services/control/AgentCommandPreparation.ts';
import type { AgentProgramCheck }                   from '../src/shared/@types/AgentProgramCheck.ts';
import { environmentCopy }                          from '../src/shared/Environment.ts';
import { AGENT_PROGRAM_CHECK_TIMEOUT_MILLISECONDS } from '../src/shared/constants/HephaestusLimits.ts';
import type { CommandContext }                      from './CommandContext.ts';

/** `forbiddenRoots`: the repository of the forge the command is for, where a program could be a job's work; none for the machine's program. */
export function agentCommandPreparationContextOf(
  context: CommandContext,
  forbiddenRoots: readonly string[],
  recordCheck?: (check: AgentProgramCheck) => void,
): AgentCommandPreparationContext {
  const { platformPorts, homeDirectory } = context;
  return {
    check: {
      adapter:              context.agentAdapter,
      resolver:             platformPorts.executableResolver,
      forbiddenRoots,
      launchEnvironment:    platformPorts.launchEnvironment,
      inheritedEnvironment: environmentCopy(),
      run:                  context.programCheckRun ?? runProgramCheck,
      timeoutMilliseconds:  AGENT_PROGRAM_CHECK_TIMEOUT_MILLISECONDS,
    },
    monitorFolder: platformPorts.dataFolders.monitorFolderOf(homeDirectory),
    toolSearch:    ProgramSearchUtil.toolSearchOf(platformPorts.programFolders, homeDirectory),
    ...(recordCheck === undefined ? {} : { recordCheck }),
  };
}
