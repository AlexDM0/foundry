/**
 * `incident answer|note <I> -- <text>` and `incident escalate <I>`: the moves on an incident itself, each one control command recorded in a
 * hold with the Overseer up or down. An answer and an escalation close the incident; a note leaves it open.
 */
import { ControlService }            from '../../src/services/control/ControlService.ts';
import type { ControlCommand }       from '../../src/shared/@types/ControlCommand.ts';
import { PRODUCT_NAMES }             from '../../src/shared/constants/ProductNames.ts';
import type { CommandContext }       from '../CommandContext.ts';
import { COMMAND_CONTROL_CONTEXT }   from '../CommandControlContext.ts';
import type { CommandHandler }       from '../CommandHandler.ts';
import { hatchWhenUnderJob }         from '../HatchUnderJob.ts';
import { openTrackerForWriting }     from '../OpenTrackerForWriting.ts';
import { incidentIdOf, refuseUsage } from '../RecordedIncidentMove.ts';
import type { ArgumentParser }       from '../arguments/ArgumentParser.ts';
import { OutputUtil }                from '../utils/OutputUtil.ts';

const { PROGRAM } = PRODUCT_NAMES;

const USAGE = `${PROGRAM} incident answer|note <I> -- <text> [--json] · ${PROGRAM} incident escalate <I> [--json]`;

export const INCIDENT_SUBCOMMAND_NAMES = ['answer', 'note', 'escalate'] as const;

type IncidentSubcommand = typeof INCIDENT_SUBCOMMAND_NAMES[number];

function commandOf(subcommand: IncidentSubcommand, commandArguments: ArgumentParser): ControlCommand {
  const incidentId = incidentIdOf(commandArguments.positionalsBeforeSeparator()[1], USAGE);
  if (commandArguments.positionalsBeforeSeparator().length > 2) refuseUsage(subcommand === 'escalate' ? 'escalate takes the incident alone.' : 'Write the text after --.', USAGE);
  if (subcommand === 'escalate') {
    if (commandArguments.positionals().length > 2) refuseUsage('escalate takes the incident alone: the agent\'s own questions go to User.', USAGE);
    return { kind: 'incident-escalate', incidentId };
  }
  const text = commandArguments.positionals().slice(2).join(' ').trim();
  if (text === '') refuseUsage('Write the text after --.', USAGE);
  return subcommand === 'answer' ? { kind: 'incident-answer', incidentId, text } : { kind: 'incident-note', incidentId, text };
}

async function recordMove(subcommand: IncidentSubcommand, commandArguments: ArgumentParser, context: CommandContext): Promise<void> {
  const command = commandOf(subcommand, commandArguments);
  await hatchWhenUnderJob(context, command);
  const { logged } = await openTrackerForWriting(commandArguments, context, (change) => ControlService.apply(command, change, COMMAND_CONTROL_CONTEXT).result);
  OutputUtil.printEntity(commandArguments, context, { command, logged }, OutputUtil.loggedSentencesOf(logged));
}

export const incidentCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  const subcommand = INCIDENT_SUBCOMMAND_NAMES.find((name) => name === commandArguments.positionals()[0]);
  if (subcommand === undefined) refuseUsage(`Write one of incident ${INCIDENT_SUBCOMMAND_NAMES.join(', ')}.`, USAGE);
  await recordMove(subcommand, commandArguments, context);
};
