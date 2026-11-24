/**
 * `machine limit [<n>] [--json]`: the machine-wide agent limit every Hephaestus of this user keeps, read or set with or without one live. It
 * needs no tracker; a live Hephaestus reads the stored limit at its next launch, and lowering it stops nothing. `machine agent [<path>]`:
 * this machine's program of the agent, which every forge that follows it starts, set only once it ran.
 */
import { MachineConfigFile }                from '../../../src/adapters/machine-config/MachineConfigFile.ts';
import { AgentCommandPreparation }          from '../../../src/services/control/AgentCommandPreparation.ts';
import { AgentPrograms }                    from '../../../src/services/control/AgentPrograms.ts';
import { AgentSlots }                       from '../../../src/services/hephaestus/AgentSlots.ts';
import { MachineAgentLimit }                from '../../../src/services/hephaestus/MachineAgentLimit.ts';
import { registeredRepositoryRootsIn }      from '../../../src/services/tracker/RegisteredRepositoryRoots.ts';
import type { ControlCommandOf }            from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }                 from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                    from '../../../src/shared/constants/ProductNames.ts';
import { agentCommandPreparationContextOf } from '../../AgentCommandContext.ts';
import { programPathFrom }                  from '../../AgentProgramWords.ts';
import type { CommandContext }              from '../../CommandContext.ts';
import type { CommandHandler }              from '../../CommandHandler.ts';
import { hatchWhenUnderJob }                from '../../HatchUnderJob.ts';
import type { ArgumentParser }              from '../../arguments/ArgumentParser.ts';
import { ProgramAnswerUtil }                from '../../utils/ProgramAnswerUtil.ts';

const LIMIT_USAGE = `${PRODUCT_NAMES.PROGRAM} machine limit [<n>] [--json]`;

const AGENT_USAGE = `${PRODUCT_NAMES.PROGRAM} machine agent [<path>] [--json]`;

const USAGE = `${LIMIT_USAGE}  |  ${AGENT_USAGE}`;

const KNOWN_OPTION_NAMES = ['json'];

const WHOLE_NUMBER_PATTERN = /^\d+$/;

export const MACHINE_SUBCOMMAND_NAMES: readonly string[] = ['limit', 'agent'];

function limitFrom(written: string, ceiling: number): number {
  if (!WHOLE_NUMBER_PATTERN.test(written)) {
    throw new OperationRefusal('refused', `"${written}" is not a machine agent limit. Write a whole number of agents from 1 to ${ceiling}.\n  Usage: ${LIMIT_USAGE}`);
  }
  return Number(written);
}

/** Read: the program each vendor runs on this machine, and where this forge's agent's installers put it. Set: run once, then stored. */
async function machineAgentProgram(commandArguments: ArgumentParser, context: CommandContext, written: string | undefined): Promise<void> {
  const monitorFolder = context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory);
  const { vendor, displayName } = context.agentAdapter;
  if (written === undefined) {
    const programPath = MachineConfigFile.programPathOf(MachineConfigFile.read(monitorFolder), vendor);
    const places = AgentPrograms.placesOf(context.agentAdapter, context.platformPorts.programFolders, context.homeDirectory, context.platformPorts.executableResolver);
    const placeLines = places.map((place) => `  ${place.path}${place.found ? '' : ' (not there)'}`);
    const humanLine = [`This machine's ${displayName}: ${programPath ?? 'none set'}.`, ...(places.length === 0 ? [] : ['Places its installers use:', ...placeLines])].join('\n');
    ProgramAnswerUtil.printAnswer(commandArguments, context, { vendor, programPath, places }, humanLine);
    return;
  }
  // The machine's program is User's choice of what runs on the machine, never a session's.
  if (context.job !== undefined) throw new OperationRefusal('refused', { kind: 'verb-not-relayable', verb: context.commandVerb, jobId: context.job.jobId });
  const programPath = programPathFrom(written, context, AGENT_USAGE);
  // Every forge that follows the machine's program runs it, so it may lie in no repository of a forge on this machine.
  await AgentCommandPreparation.requireRunningProgram(vendor, programPath, agentCommandPreparationContextOf(context, registeredRepositoryRootsIn(monitorFolder)));
  const write = MachineConfigFile.writeAgentProgram(monitorFolder, vendor, programPath);
  if (write !== 'written') {
    const reason = write.verdict === 'newer-version' ? `its version ${write.version} is newer than this program reads` : write.reason;
    throw new OperationRefusal('refused', { kind: 'machine-config-unwritable', filePath: MachineConfigFile.pathIn(monitorFolder), reason });
  }
  ProgramAnswerUtil.printAnswer(commandArguments, context, { outcome: 'done', vendor, programPath }, `This machine's ${displayName} is ${programPath}.`);
}

export const machineCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(2, USAGE);
  const [subcommand, written] = commandArguments.positionals();
  if (subcommand === 'agent') {
    await machineAgentProgram(commandArguments, context, written);
    return;
  }
  if (subcommand !== 'limit') throw new OperationRefusal('refused', `Unknown machine subcommand "${subcommand ?? ''}". Write limit or agent.\n  Usage: ${USAGE}`);

  const monitorFolder = context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory);
  const ceiling = MachineAgentLimit.cpuCeiling();
  if (written === undefined) {
    const reading = MachineAgentLimit.readingIn(monitorFolder, ceiling);
    const agentsInFlight = AgentSlots.liveHoldingCountIn(context.platformPorts, monitorFolder);
    ProgramAnswerUtil.printAnswer(
      commandArguments,
      context,
      { limit: reading.limit, ceiling, agentsInFlight },
      `${reading.limit} agents at once on this machine (at most ${ceiling}, its CPUs); ${agentsInFlight} in flight.`,
    );
    return;
  }
  const limit = limitFrom(written, ceiling);
  const command: ControlCommandOf<'machine-agent-limit-set'> = { kind: 'machine-agent-limit-set', limit };
  await hatchWhenUnderJob(context, command);
  const outcome = MachineAgentLimit.setIn(monitorFolder, limit, ceiling);
  const humanLine = outcome === 'done'
    ? `The machine agent limit is ${limit}; agents in flight finish whatever the limit.`
    : `The machine agent limit is already ${limit}; nothing to do.`;
  ProgramAnswerUtil.printAnswer(commandArguments, context, { outcome, limit, ceiling }, humanLine);
};
