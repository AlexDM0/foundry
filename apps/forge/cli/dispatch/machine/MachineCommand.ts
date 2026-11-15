/**
 * `machine limit [<n>] [--json]`: the machine-wide agent limit every Overseer of this user keeps, read or set with or without one live. It
 * needs no tracker; a live Overseer reads the stored limit at its next launch, and lowering it stops nothing.
 */
import { AgentSlots }            from '../../../src/services/overseer/AgentSlots.ts';
import { MachineAgentLimit }     from '../../../src/services/overseer/MachineAgentLimit.ts';
import type { ControlCommandOf } from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal }      from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }         from '../../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }   from '../../CommandHandler.ts';
import { hatchWhenUnderJob }     from '../../HatchUnderJob.ts';
import { ProgramAnswerUtil }     from '../../utils/ProgramAnswerUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} machine limit [<n>] [--json]`;

const KNOWN_OPTION_NAMES = ['json'];

const WHOLE_NUMBER_PATTERN = /^\d+$/;

export const MACHINE_SUBCOMMAND_NAMES: readonly string[] = ['limit'];

function limitFrom(written: string, ceiling: number): number {
  if (!WHOLE_NUMBER_PATTERN.test(written)) {
    throw new OperationRefusal('refused', `"${written}" is not a machine agent limit. Write a whole number of agents from 1 to ${ceiling}.\n  Usage: ${USAGE}`);
  }
  return Number(written);
}

export const machineCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(2, USAGE);
  const [subcommand, written] = commandArguments.positionals();
  if (subcommand !== 'limit') throw new OperationRefusal('refused', `Unknown machine subcommand "${subcommand ?? ''}". Write limit.\n  Usage: ${USAGE}`);

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
