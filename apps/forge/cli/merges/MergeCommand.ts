/** `merge accept|update <id>`: User's merge approval moves on a ticket waiting for merge, each one control command in one hold. */
import { PRODUCT_NAMES }                   from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }             from '../CommandHandler.ts';
import { recordIncidentMove, refuseUsage } from '../RecordedIncidentMove.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} merge accept|update <id> [--json]`;

export const MERGE_SUBCOMMAND_NAMES = ['accept', 'update'] as const;

export const mergeCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  const subcommand = MERGE_SUBCOMMAND_NAMES.find((candidate) => candidate === commandArguments.positionals()[0]);
  if (subcommand === undefined) refuseUsage('Write merge accept or merge update.', USAGE);
  commandArguments.rejectExtraPositionals(2, USAGE);
  const ticketReference = commandArguments.positionals()[1];
  if (ticketReference === undefined) refuseUsage('Name the ticket, as 12.', USAGE);
  await recordIncidentMove(commandArguments, context, { kind: subcommand === 'accept' ? 'merge-accept' : 'merge-update', ticketReference });
};
